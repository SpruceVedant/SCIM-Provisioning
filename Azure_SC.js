   const execute = () => {
      try {
        
        const accessToken = getAccessToken();
  
        if (!accessToken) {
          log.error('Authentication Failed', 'Unable to fetch access token from Microsoft Graph API.');
          return;
        }
  
        log.debug('Access Token Retrieved', accessToken);
  
        const users = fetchUsersFromGraphAPI(accessToken);
  
        if (!users || users.length === 0) {
          log.debug('No Users Found', 'No users were retrieved from Microsoft Graph API.');
          return;
        }
  
        log.debug('Users Fetched', `Total Users: ${users.length}`);
  
        users.forEach((user) => {
          createEmployeeInNetSuite(user);
        });
      } catch (error) {
        log.error('Error in Scheduled Script Execution', error.message);
      }
    };
  
    const getAccessToken = () => {
      try {
        const response = https.post({
          url: MICROSOFT_GRAPH_API_TOKEN_URL,
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded' 
          },
          body: 'client_id=' + CLIENT_ID +
                '&client_secret=' + CLIENT_SECRET + 
                '&scope=' + SCOPE + 
                '&grant_type=client_credentials'
        });
  
        log.debug('Token Request Response', response.body); 

        const responseBody = JSON.parse(response.body);

       
        if (responseBody && responseBody.access_token) {
          return responseBody.access_token;
        }

        
        log.error('Token Retrieval Error', `Error Response: ${response.body}`);
        return null;
      } catch (error) {
        log.error('Error Fetching Access Token', `Error: ${error.message}`);
        return null;
      }
    };
  
    const fetchUsersFromGraphAPI = (accessToken) => {
      try {
        const response = https.get({
          url: MICROSOFT_GRAPH_API_USERS_URL,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept':'application/json',
          },
        });
  
        log.debug('User Fetch Response', response.body); 
  
        const responseBody = JSON.parse(response.body);
  
        if (responseBody && responseBody.value) {
          return responseBody.value;
        }
  
        log.error('User Fetch Error', `Error Response: ${response.body}`);
        return [];
      } catch (error) {
        log.error('Error Fetching Users from Graph API', `Error: ${error.message}`);
        return [];
      }
    };
  
    const createEmployeeInNetSuite = (user) => {
        try {
          const firstName = user.givenName || 'FirstName';
          const lastName = user.surname || 'LastName';
          const email = user.mail || user.userPrincipalName;
      
        //   const DEFAULT_CURRENCY = '1'; 
          const DEFAULT_SUBSIDIARY = '1'; 
      
          const employeeRecord = record.create({
            type: record.Type.EMPLOYEE,
            isDynamic: true,
          });
      
          employeeRecord.setValue({ fieldId: 'firstname', value: firstName });
          employeeRecord.setValue({ fieldId: 'lastname', value: lastName });
          employeeRecord.setValue({ fieldId: 'email', value: email });
          employeeRecord.setValue({ fieldId: 'isinactive', value: false });
          // employeeRecord.setValue({ fieldId: 'currency', value: DEFAULT_CURRENCY });
          employeeRecord.setValue({ fieldId: 'subsidiary', value: DEFAULT_SUBSIDIARY });
      
          const employeeId = employeeRecord.save();
          log.audit('Employee Created', `Employee ID: ${employeeId}, Email: ${email}`);
        } catch (error) {
          log.error('Error Creating Employee', `User: ${user.userPrincipalName}, Error: ${error.message}`);
        }
      };
