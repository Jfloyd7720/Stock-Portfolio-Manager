import React, { useState } from "react";
import { Layout } from "antd";
import { useNavigate } from "react-router-dom";
import StockSearch from "./StockSearch";
import StockChart from "./StockChart";

const { Content } = Layout;

const Home = () => {
  const navigate = useNavigate();
  const [selectedSymbol, setSelectedSymbol] = useState("TSLA");
  const [selectedDays, setSelectedDays] = useState(10); // Default 10 days

  return (
    <Content
      style={{ padding: "48px", minHeight: "100vh", background: "#f4f4f4" }}
    >
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          background: "#ffffff",
          padding: "40px",
          borderRadius: "10px",
          boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)",
          textAlign: "center",
        }}
      >
        <h1>Welcome to the Stock Portfolio Manager</h1>
        <p style={{ fontSize: "16px", color: "#555", marginBottom: "20px" }}>
          Track and calculate your stock investments with ease.
        </p>
        <StockSearch
          onSymbolChange={setSelectedSymbol}
          onDaysChange={setSelectedDays}
        />
        <StockChart symbol={selectedSymbol} days={selectedDays} />
      </div>
    </Content>
  );
};

export default Home;
