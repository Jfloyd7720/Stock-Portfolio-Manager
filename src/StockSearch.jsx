import React, { useState } from "react";
import { Input, Button, message, Spin, Select } from "antd";
import axios from "axios";

const { Option } = Select;

const StockSearch = ({ onSymbolChange, onDaysChange }) => {
  const [stockSymbol, setStockSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedDays, setSelectedDays] = useState(10); // Default to 10 days

  const handleSearch = async () => {
    if (!stockSymbol) {
      message.error("Please enter a stock symbol.");
      return;
    }

    setLoading(true);

    try {
      onSymbolChange(stockSymbol.toUpperCase());
      onDaysChange(selectedDays); // Pass the selected number of days to parent component
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
        style={{ width: "300px", marginBottom: "10px" }}
      />

      {/* Dropdown for selecting trading days */}
      <Select
        value={selectedDays}
        onChange={(value) => setSelectedDays(value)}
        style={{ width: "150px", marginBottom: "10px", marginLeft: "10px" }}
      >
        <Option value={5}>Last 5 Days</Option>
        <Option value={10}>Last 10 Days</Option>
        <Option value={20}>Last 20 Days</Option>
        <Option value={50}>Last 50 Days</Option>
        <Option value={100}>Last 100 Days</Option>
      </Select>

      <br />
      <Button type="primary" onClick={handleSearch} loading={loading}>
        Search
      </Button>

      {loading && <Spin style={{ marginTop: "20px" }} />}
    </div>
  );
};

export default StockSearch;
