import axios from "axios";

// Create an Axios instance
const api = axios.create({
  baseURL: "http://localhost:8080", // Update to match your backend
  withCredentials: true, // Allows cookies to be sent
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
