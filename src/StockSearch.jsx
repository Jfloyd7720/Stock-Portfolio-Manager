import React, { useState } from "react";
import { Input, Button, message, Spin } from "antd";
import axios from "axios";

const StockSearch = ({ onSymbolChange }) => {
  const [stockSymbol, setStockSymbol] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!stockSymbol) {
      message.error("Please enter a stock symbol.");
      return;
    }

    setLoading(true);

    try {
      // Update the symbol in the parent component
      onSymbolChange(stockSymbol.toUpperCase());
    } catch (error) {
      message.error("Error fetching stock data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginBottom: "30px" }}>
      <h2>Stock Search</h2>
      <Input
        value={stockSymbol}
        onChange={(e) => setStockSymbol(e.target.value.toUpperCase())}
        placeholder="Enter stock symbol (e.g., AAPL)"
        style={{ width: "300px", marginBottom: "20px" }}
      />
      <Button type="primary" onClick={handleSearch} loading={loading}>
        Search
      </Button>

      {loading && <Spin style={{ marginTop: "20px" }} />}
    </div>
  );
};

export default StockSearch;
