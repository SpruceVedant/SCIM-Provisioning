/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/record', 'N/https', 'N/log', 'N/search'], (record, https, log, search) => {

   
    const departmentSubsidiaryMap = {
        "havas creative network": 1,
        "havas india": 2,
        "havas life": 3,
        "shobiz": 6,
        "think design": 8,
        "default department": 1
    };

   
    const employeeTypeRoleMap = {
        "admin": [3],
        "employee center": [15],
        "ceo": [8],
        "sso role": [1137],
        "default role": [15] 
    };

    const execute = () => {
        try {
            log.audit('Scheduled Script Started', 'Syncing users from Azure AD with NetSuite.');

            const accessToken = getAccessToken();
            if (!accessToken) {
                log.error('Access Token Error', 'Failed to fetch access token from Azure AD.');
                return;
            }

            const azureUsers = fetchUsersFromGraphAPI(accessToken);
            if (!azureUsers || azureUsers.length === 0) {
                log.audit('No Users Found', 'No users were fetched from Azure AD.');
                return;
            }

            log.audit('Users Fetched', `Total users fetched: ${azureUsers.length}`);

            const nsEmployees = fetchAllNetSuiteEmployees();

            syncUsers(azureUsers, nsEmployees);
        } catch (error) {
            log.error('Error in Scheduled Script Execution', error.message);
        }
    };

    const getAccessToken = () => {
        try {
            const response = https.post({
                url: TOKEN_URL,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&scope=${SCOPE}&grant_type=client_credentials`,
            });

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
                url: GRAPH_API_USERS_URL,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            });

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

    const fetchAllNetSuiteEmployees = () => {
        const employees = {};
        search.create({
            type: search.Type.EMPLOYEE,
            columns: ['internalid', 'email', 'firstname', 'lastname', 'subsidiary', 'title', 'isinactive'],
        }).run().each((result) => {
            employees[result.getValue('email')?.toLowerCase()] = {
                id: result.id,
                firstname: result.getValue('firstname'),
                lastname: result.getValue('lastname'),
                subsidiary: result.getValue('subsidiary'),
                title: result.getValue('title'),
                isinactive: result.getValue('isinactive') === 'T',
            };
            return true;
        });
        return employees;
    };

    const syncUsers = (azureUsers, nsEmployees) => {
        azureUsers.forEach((user) => {
            const email = (user.mail || user.userPrincipalName || '').toLowerCase();
            const existingEmployee = nsEmployees[email];

            if (existingEmployee) {
                updateEmployeeIfChanged(existingEmployee, user);
            } else {
                log.audit('User Not Found in NetSuite', `Email: ${email}. Creating a new employee.`);
                createAndAssignRoleToEmployee(user);
            }
        });
    };

    const updateEmployeeIfChanged = (existingEmployee, user) => {
        try {
            const updates = {};
            const department = user.department?.trim().toLowerCase() || 'default department';
            const subsidiaryId = departmentSubsidiaryMap[department];
            const employeeType = user.jobTitle?.trim().toLowerCase() || 'default role';
            const title = user.jobTitle || '';

            if (existingEmployee.subsidiary != subsidiaryId) updates.subsidiary = subsidiaryId;
            if (existingEmployee.title !== title) updates.title = title;

            if (Object.keys(updates).length > 0) {
                log.audit('Updating Employee', `Employee ID: ${existingEmployee.id}, Updates: ${JSON.stringify(updates)}`);
                const employeeRecord = record.load({
                    type: record.Type.EMPLOYEE,
                    id: existingEmployee.id,
                });

                for (const fieldId in updates) {
                    employeeRecord.setValue({ fieldId, value: updates[fieldId] });
                }

                employeeRecord.save();
                log.audit('Employee Updated', `Employee ID: ${existingEmployee.id}`);
            }
        } catch (error) {
            log.error('Error Updating Employee', `Error: ${error.message}`);
        }
    };

    const createAndAssignRoleToEmployee = (user) => {
        try {
            const firstName = user.givenName || 'DefaultFirstName';
            const lastName = user.surname || 'DefaultLastName';
            const email = user.mail || user.userPrincipalName;

            const department = user.department?.trim().toLowerCase() || 'default department';
            const subsidiaryId = departmentSubsidiaryMap[department] || 1; // Default Subsidiary

            const employeeType = user.jobTitle?.trim().toLowerCase() || 'default role';
            const roles = employeeTypeRoleMap[employeeType] || [15]; // Default Role

            log.debug('Creating Employee', `Name: ${firstName} ${lastName}, Email: ${email}, Subsidiary: ${subsidiaryId}, Roles: ${roles}`);

            const employeeRecord = record.create({
                type: record.Type.EMPLOYEE,
                isDynamic: true,
            });

            employeeRecord.setValue({ fieldId: 'firstname', value: firstName });
            employeeRecord.setValue({ fieldId: 'lastname', value: lastName });
            employeeRecord.setValue({ fieldId: 'email', value: email });
            employeeRecord.setValue({ fieldId: 'subsidiary', value: subsidiaryId });
            employeeRecord.setValue({ fieldId: 'isinactive', value: false });
            employeeRecord.setValue({ fieldId: 'giveaccess', value: true });

            roles.forEach((roleId) => {
                employeeRecord.selectNewLine({ sublistId: 'roles' });
                employeeRecord.setCurrentSublistValue({ sublistId: 'roles', fieldId: 'selectedrole', value: roleId });
                employeeRecord.commitLine({ sublistId: 'roles' });
            });

            const employeeId = employeeRecord.save();
            log.audit('Employee Created Successfully', `Employee ID: ${employeeId}`);
        } catch (error) {
            log.error('Error Creating Employee', `Error: ${error.message}`);
        }
    };

    return { execute };
});
