const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json({ type: ['application/json', 'application/scim+json'] }));

const config = {
  ACCOUNT_ID: '9370186_SB1',
  CONSUMER_KEY: '',
  CONSUMER_SECRET: '',
  TOKEN_ID: '',
  TOKEN_SECRET: '',
  DEFAULT_PASSWORD: 'SecurePassword123',
};


const departmentSubsidiaryMap = {
  "Havas Creative Network": "1",
  "Havas India": "2",
  "Havas Life": "3",
  "Shobiz": "6",
};

const employeeTypeRoleMap = {
  "Admin": ["8", "55"],
  "Employee Center": ["15"],
  "CEO": ["8"],
  "SSO Role": ["1137"],
};

// Generate OAuth 1.0 Signature
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


app.post(['/Users', '/Users/Users'], async (req, res) => {
  console.log('Raw Request Body:', JSON.stringify(req.body, null, 2));
  const user = req.body;

  console.log('Incoming Azure Provisioning Request:', user);

 
  const displayNameParts = user.displayName?.trim().split(/\s+/) || [];
  const firstName = displayNameParts[0] || 'FirstName';
  const lastName = displayNameParts.slice(1).join(' ') || 'LastName';


  const department = user.department?.trim();
  const subsidiaryId = departmentSubsidiaryMap[department];

  if (!subsidiaryId) {
    console.error(`Invalid or missing department '${department}' in Azure request.`);
    return res.status(400).send({ error: `Department '${department}' is not mapped to any subsidiary.` });
  }


  const employeeType = user.employeeType?.trim() || "Employee Center"; 
  const roles = employeeTypeRoleMap[employeeType];

  if (!roles || roles.length === 0) {
    console.error(`Invalid or missing employee type '${employeeType}' in Azure request.`);
    return res.status(400).send({ error: `Employee type '${employeeType}' is not mapped to any roles.` });
  }


  const rolesPayload = roles.map((roleId) => ({
    selectedrole: roleId.toString(),
  }));


  const employeePayload = {
    firstname: firstName,
    lastname: lastName,
    email: user.userName || 'default@example.com',
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

app.listen(3000, () => console.log('Middleware running on port 3000'));
