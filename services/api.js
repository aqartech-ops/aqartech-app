const API_BASE_URL = 'http://192.168.1.123:3000';

export async function getCompanies() {
  try {
    const response = await fetch(`${API_BASE_URL}/company`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching companies:', error);
    return [];
  }
}

export async function createCompany(companyData) {
  try {
    const response = await fetch(`${API_BASE_URL}/company`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(companyData),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating company:', error);
    return null;
  }
}