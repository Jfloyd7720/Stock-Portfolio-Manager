import React, { useState } from "react";
import { Layout } from "antd";
import StockSearch from "./StockSearch"; // Import the StockSearch component
import StockChart from "./StockChart"; // Import the StockChart component

const { Content } = Layout;

const Home = () => {
  const [symbol, setSymbol] = useState("TSLA"); // Default to "TSLA"

  const handleSymbolChange = (newSymbol) => {
    setSymbol(newSymbol);
  };

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
        <StockSearch onSymbolChange={handleSymbolChange} />{" "}
        {/* Pass handleSymbolChange to StockSearch */}
        <StockChart symbol={symbol} /> {/* Pass the symbol to StockChart */}
      </div>
    </Content>
  );
};

export default Home;
