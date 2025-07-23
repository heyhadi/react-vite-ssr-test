import React, { useState, useEffect } from "react";
import LoginForm from "../../components/LoginForm/loginForm";
import "./Login.scss";

interface LoginPageProps {
  history?: any;
}

const Login: React.FC<LoginPageProps> = ({ history }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOnSubmit = async (formData: { username: string; password: string }) => {
  try {
    setLoading(true);
    setError("");
    
    // Prepare the login data with email and password
    const loginData = {
      username: formData.username,
      password: formData.password // Using username field as password for now
    };

    console.log("Login data:", loginData);
    
    // Make API call to login endpoint
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginData),
    });
    
    // Parse the response
    const data = await response.json();
    
    if (response.ok) {
      // Login successful
      console.log("Login successful:", data);
      
      // Store token if provided
      if (data.token) {
        localStorage.setItem("authToken", data.token);
        // or sessionStorage.setItem("authToken", data.token);
      }
      
      // Store user data if provided
      if (data.user) {
        localStorage.setItem("userData", JSON.stringify(data.user));
      }
      
      // Redirect to dashboard or handle success
      if (history) {
        history.push('/');
      } else {
        // Alternative redirect method if history is not available
        window.location.href = '/';
      }
      
    } else {
      // Login failed - handle error response
      const errorMessage = data.message || data.error || 'Login failed. Please try again.';
      setError(errorMessage);
    }
    
  } catch (err) {
    console.error("Login error:", err);
    
    // Handle network errors or other exceptions
    if (err instanceof TypeError && err.message.includes('fetch')) {
      setError("Network error. Please check your connection and try again.");
    } else {
      setError("An unexpected error occurred. Please try again.");
    }
  } finally {
    setLoading(false);
  }
};

  // Optional: Clear error when component unmounts or when user starts typing
  useEffect(() => {
    return () => {
      setError("");
    };
  }, []);

  return (
    <section className="app flex-row align-items-center min-vh-100 position-relative">
      <div className="w-50 text-center min-vh-100 d-flex align-items-center justify-content-center bg-theme">
        <div className="d-flex flex-column align-items-center">
          <img
            src="/assets/img/brand/logo-white.png"
            alt="GetGo Cms"
            className="login-logo"
          />
          <p className="copyright-text">
            Copyright © 2025. All Rights Reserved
          </p>
        </div>
      </div>
      <div className="w-50 bg-white h-100 d-flex align-items-center">
        <div className="w-75 mx-auto">
          <h1 className="large-4x mb-4 fw-bold text-center">GetGo CMS</h1>
          
          <LoginForm
            error={error}
            onSubmit={handleOnSubmit}
            loading={loading}
          />
        </div>
      </div>
    </section>
  );
};

export default Login;