const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json({ type: ['application/json', 'application/scim+json'] }));

const config = {
  ACCOUNT_ID: 'TD2975250',
  CONSUMER_KEY: '',
  CONSUMER_SECRET: '',
  TOKEN_ID: 'edd3b0135f7d89a18e9225cb19b9d5be04137b99c35b7bbccf5823392d7f3f18',
  TOKEN_SECRET: '97a7c0e58e37773e6e374d137808c8f725fcb6864deb3d5204e8ca30c5cd5e5f',
  DEFAULT_PASSWORD: 'SecurePassword123',
  AUTH_TOKEN: 'sjdgfsdjhfgjsd122123',
};

const departmentSubsidiaryMap = {
  "havas india": "2",
  "think design": "8",
  "parent company": "1",
};

const employeeTypeRoleMap = {
  admin: ["3"],
  "employee center": ["15"],
  ceo: ["8"],
  "sso role": ["1137"],
};

const authenticate = (req, res, next) => {
  const token = req.headers['x-api-key'] || req.headers['authorization']?.split(' ')[1];

  if (!token || token !== config.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
  }

  next();
};

app.use(authenticate);

// Generatein OAuth 1.0 Signature
const generateOAuthHeaders = (url, method) => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  const params = {
    oauth_consumer_key: config.CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_token: config.TOKEN_ID,
    oauth_version: '1.0',
  };

  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
  const signingKey = `${config.CONSUMER_SECRET}&${config.TOKEN_SECRET}`;

  const signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64');

  params.oauth_signature = signature;

  const authHeader =
    `OAuth realm="${config.ACCOUNT_ID.toUpperCase()}", ` +
    Object.keys(params)
      .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(params[key])}"`)
      .join(', ');

  return {
    Authorization: authHeader,
    'Content-Type': 'application/json',
    'Content-Return': 'representation',
    prefer: 'transient',
  };
};

app.get(['/Users', '/Users/Users'], (req, res) => {
  console.log('Incoming GET request to /Users');
  res.status(200).send({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 0,
    Resources: [],
  });
});

// SCIM POST - Create User
app.post(['/Users', '/Users/Users'], async (req, res) => {
  const user = req.body;
  console.log('Incoming Azure Provisioning Request:', user);

  const firstName = user.name?.givenName || 'FirstName';
  const lastName = user.name?.familyName || 'LastName';
  const email = user.userName || 'default@example.com';
  const mobile = user.mobile || '12345678';

  const department = user['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.department?.trim().toLowerCase() || 'parent company';
  const subsidiaryId = departmentSubsidiaryMap[department];

  if (!subsidiaryId) {
    console.error(`Invalid or missing department: '${department}'`);
    return res.status(400).send({ error: `Department '${department}' is not mapped to a subsidiary.` });
  }

  const rawEmployeeType = user['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.division?.trim().toLowerCase() || 'employee center';
  const roles = employeeTypeRoleMap[rawEmployeeType];

  if (!roles || roles.length === 0) {
    console.error(`Invalid or missing employee type: '${rawEmployeeType}'`);
    return res.status(400).send({ error: `Employee type '${rawEmployeeType}' is not mapped to roles.` });
  }

  const rolesPayload = roles.map((roleId) => ({
    selectedrole: roleId.toString(),
  }));

  const employeePayload = {
    firstname: firstName,
    lastname: lastName,
    mobile,
    email,
    subsidiary: { id: subsidiaryId },
    giveaccess: true,
    password: config.DEFAULT_PASSWORD,
    password2: config.DEFAULT_PASSWORD,
    isinactive: false,
    roles: { items: rolesPayload },
  };

  console.log('Mapped Payload to NetSuite:', JSON.stringify(employeePayload, null, 2));

  const netsuiteUrl = `https://${config.ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/employee`;

  try {
    const headers = generateOAuthHeaders(netsuiteUrl, 'POST');
    const response = await axios.post(netsuiteUrl, employeePayload, { headers });

    console.log('User provisioned successfully:', response.data);
    res.status(201).send({
      id: response.data.id || '12345',
      meta: {
        resourceType: 'User',
        location: `/Users/${response.data.id || '12345'}`,
      },
    });
  } catch (error) {
    console.error('Error provisioning user in NetSuite:', error.response?.data || error.message);
    res.status(500).send({ status: 'failure', error: error.response?.data || error.message });
  }
});

// SCIM PATCH - Update User
app.patch(['/Users/:id', '/Users/Users/:id'], async (req, res) => {
  const userId = req.params.id;
  const user = req.body;
  console.log('Incoming Update Request for User ID:', userId);

  const employeePayload = {
    firstname: user.name?.givenName,
    lastname: user.name?.familyName,
    email: user.userName,
    phone: user.phone,
  };

  const netsuiteUrl = `https://${config.ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/employee/${userId}`;

  try {
    const headers = generateOAuthHeaders(netsuiteUrl, 'PATCH');
    const response = await axios.patch(netsuiteUrl, employeePayload, { headers });

    console.log('User updated successfully:', response.data);
    res.status(200).send(response.data);
  } catch (error) {
    console.error('Error updating user in NetSuite:', error.response?.data || error.message);
    res.status(500).send({ status: 'failure', error: error.response?.data || error.message });
  }
});

// SCIM DELETE - Deactivate User
app.delete(['/Users/:id', '/Users/Users/:id'], async (req, res) => {
  const userId = req.params.id;
  console.log('Incoming Delete Request for User ID:', userId);

  const netsuiteUrl = `https://${config.ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/employee/${userId}`;

  try {
    const headers = generateOAuthHeaders(netsuiteUrl, 'PATCH');
    await axios.patch(netsuiteUrl, { isinactive: true }, { headers });

    console.log(`User with ID ${userId} marked as inactive in NetSuite.`);
    res.status(204).send();
  } catch (error) {
    console.error('Error deactivating user in NetSuite:', error.response?.data || error.message);
    res.status(500).send({ status: 'failure', error: error.response?.data || error.message });
  }
});

app.listen(3000, () => console.log('Middleware running on port 3000'));
