app.post(['/Users', '/Users/Users'], async (req, res) => {
    console.log('Raw Request Body:', JSON.stringify(req.body, null, 2));
    const user = req.body;
  
    console.log('Incoming Azure Provisioning Request:', user);
  
    // Extract name and email
    const firstName = user.name?.givenName || 'FirstName';
    const lastName = user.name?.familyName || 'LastName';
    const email = user.userName || 'default@example.com';
  
    // Extract and normalize department
    const department = user['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.department?.trim().toLowerCase();
    const subsidiaryId = departmentSubsidiaryMap[department];
  
    if (!subsidiaryId) {
      console.error(`Invalid or missing department: '${department}'`);
      return res.status(400).send({ error: `Department '${department}' is not mapped to a subsidiary.` });
    }
  
    // Extract and normalize employee type
    const rawEmployeeType = user.employeeType || null; // Root-level field
    const employeeType = rawEmployeeType?.trim().toLowerCase();
  
    console.log(`Raw Employee Type: ${rawEmployeeType}`); // Debug log
    console.log(`Normalized Employee Type: ${employeeType}`); // Debug log
  
    const roles = employeeTypeRoleMap[employeeType];
  
    if (!roles || roles.length === 0) {
      console.error(`Invalid or missing employee type: '${employeeType}'`);
      return res.status(400).send({ error: `Employee type '${employeeType}' is not mapped to roles.` });
    }
  
    const rolesPayload = roles.map((roleId) => ({
      selectedrole: roleId.toString(),
    }));
  
    // Construct the employee payload
    const employeePayload = {
      firstname: firstName,
      lastname: lastName,
      email: email,
      subsidiary: { id: subsidiaryId },
      giveaccess: true,
      password: config.DEFAULT_PASSWORD,
      password2: config.DEFAULT_PASSWORD,
      isinactive: false,
      roles: { items: rolesPayload },
    };
  
    console.log('Mapped Payload to NetSuite:', JSON.stringify(employeePayload, null, 2));
  
    const netsuiteUrl = `https://${config.ACCOUNT_ID.toLowerCase()}.suitetalk.api.netsuite.com/services/rest/record/v1/employee`;
  
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
