const axios = require('axios');

async function registerGitHub() {
    try {
        const response = await axios.post('http://localhost:3000/registry/register', {
            name: "GitHub",
            url: "https://api.github.com",
            description: "Manage repositories, issues, and code.",
            type: "EXTERNAL",
            staticDocs: `
                Goal: Manage GitHub resources.
                Base URL: https://api.github.com
                
                1. Create Issue:
                - Endpoint: POST /repos/{owner}/{repo}/issues
                - Body: { "title": "string", "body": "string" }
                
                2. Get User Info:
                - Endpoint: GET /user
                
                3. Create Repo:
                - Endpoint: POST /user/repos
                - Body: { "name": "string", "private": boolean }
            `
        });
        console.log("GitHub Agent Registered:", response.data);
    } catch (error) {
        console.error("Registration Failed:", error.message);
        if (error.response) console.error(error.response.data);
    }
}

registerGitHub();
