const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json({ type: ['application/json', 'application/scim+json'] }));

const config = {
  ACCOUNT_ID: 'td2953323',
  CONSUMER_KEY: '',
  CONSUMER_SECRET: '',
  TOKEN_ID: '',
  TOKEN_SECRET: '',
  DEFAULT_SUBSIDIARY_ID: '1', 
  DEFAULT_LOCATION_ID: '2',
  DEFAULT_DEPARTMENT_ID: '3', 
};


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
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 0,
    Resources: [],
  });
});

app.post(['/Users', '/Users/Users'], async (req, res) => {
  console.log('Raw Request Body:', JSON.stringify(req.body, null, 2));
  const user = req.body;

  console.log('Incoming Azure Provisioning Request:', user);

  
  const displayNameParts = user.displayName?.trim().split(/\s+/) || [];
  const firstName = displayNameParts[0] || 'FirstName';
  const lastName = displayNameParts.slice(1).join(' ') || 'LastName';

  
  const location = user.location || config.DEFAULT_LOCATION_ID; 
  const department = user.department || config.DEFAULT_DEPARTMENT_ID; 
  const phone = user.phoneNumbers?.[0]?.value || null;
  const title = user.title || null; 
  const hireDate = user.hireDate || null;

  
  const employeePayload = {
    firstname: firstName,
    lastname: lastName,
    email: user.userName || 'default@example.com',
    subsidiary: { id: config.DEFAULT_SUBSIDIARY_ID },
    location: { id: location },
    department: { id: department },
    phone,
    title,
    hiredate: hireDate,
    giveaccess: true,
    password: 'SecurePassword123',
    password2: 'SecurePassword123',
    isinactive: false,
  };

  console.log('Mapped Payload to NetSuite:', employeePayload);

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
