import React, { useState, useEffect } from "react";
import { Table } from "antd";
import { Column } from "@ant-design/plots";

const PortfolioPerformance = ({ stocks }) => {
  const [stockData, setStockData] = useState([]);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    if (stocks.length > 0) {
      const performanceData = stocks.map((stock) => {
        const change =
          ((stock.currentPrice - stock.initialPrice) / stock.initialPrice) *
          100;
        return {
          key: stock.ticker,
          ticker: stock.ticker,
          initialPrice: `$${stock.initialPrice.toFixed(2)}`,
          currentPrice: `$${stock.currentPrice.toFixed(2)}`,
          changePercent: `${change.toFixed(2)}%`,
          change,
        };
      });

      const sortedData = [...performanceData].sort(
        (a, b) => b.change - a.change
      );
      const bestPerformers = sortedData.slice(0, 3);
      const worstPerformers = sortedData.slice(-3);

      setStockData([...bestPerformers, ...worstPerformers]);
      setChartData(
        [...bestPerformers, ...worstPerformers].map((stock) => ({
          ticker: stock.ticker,
          change: stock.change,
        }))
      );
    }
  }, [stocks]);

  const columns = [
    { title: "Stock", dataIndex: "ticker", key: "ticker" },
    { title: "Initial Price", dataIndex: "initialPrice", key: "initialPrice" },
    { title: "Current Price", dataIndex: "currentPrice", key: "currentPrice" },
    { title: "% Change", dataIndex: "changePercent", key: "changePercent" },
  ];

  const columnConfig = {
    data: chartData,
    xField: "ticker",
    yField: "change",
    color: ({ change }) => (change > 0 ? "#52c41a" : "#ff4d4f"),
    label: {
      position: "middle",
      style: { fill: "#fff" },
    },
  };

  return (
    <div
      style={{ padding: "20px", background: "#f8f9fa", borderRadius: "10px" }}
    >
      <h2 style={{ textAlign: "center" }}>Best & Worst Performing Stocks</h2>
      <Table
        dataSource={stockData}
        columns={columns}
        pagination={false}
        bordered
        style={{ marginBottom: "20px" }}
      />
      <Column {...columnConfig} />
    </div>
  );
};

export default PortfolioPerformance;
