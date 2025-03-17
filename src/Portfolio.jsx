import React, { useState } from "react";
import { Layout, Table, Form, Input, Button, message } from "antd";
import { Column, Pie } from "@ant-design/plots";
import PortfolioPerformance from "./PortfolioPerformance";

const { Content } = Layout;
const sampleStocks = [
  { ticker: "AAPL", initialPrice: 150, currentPrice: 180 },
  { ticker: "TSLA", initialPrice: 700, currentPrice: 650 },
  { ticker: "GOOGL", initialPrice: 120, currentPrice: 150 },
  { ticker: "MSFT", initialPrice: 280, currentPrice: 290 },
  { ticker: "AMZN", initialPrice: 3100, currentPrice: 3300 },
];
const Portfolio = () => {
  const [form] = Form.useForm();
  const [stocks, setStocks] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [totalValue, setTotalValue] = useState(0);

  // Function to update portfolio when a stock is added
  const updatePortfolio = (newStocks) => {
    const updatedChartData = newStocks.map((stock) => ({
      category: stock.name,
      value: stock.totalValue,
    }));

    const updatedPieData = newStocks.map((stock) => ({
      type: stock.name,
      value: stock.totalValue,
    }));

    const total = newStocks.reduce((acc, stock) => acc + stock.totalValue, 0);

    setChartData(updatedChartData);
    setPieData(updatedPieData);
    setTotalValue(total);
  };

  // Form submission handler
  const onFinish = (values) => {
    const { stockName, sharesOwned, stockPrice } = values;
    const ownedShares = parseFloat(sharesOwned);
    const pricePerShare = parseFloat(stockPrice);

    if (
      isNaN(ownedShares) ||
      isNaN(pricePerShare) ||
      ownedShares <= 0 ||
      pricePerShare <= 0
    ) {
      message.error("Please enter valid numbers for shares and price.");
      return;
    }

    const newStock = {
      key: stocks.length + 1,
      name: stockName,
      shares: ownedShares,
      price: pricePerShare,
      totalValue: ownedShares * pricePerShare,
    };

    const updatedStocks = [...stocks, newStock];
    setStocks(updatedStocks);
    updatePortfolio(updatedStocks);
    form.resetFields();
  };

  // Table columns
  const columns = [
    { title: "Stock Name", dataIndex: "name", key: "name" },
    { title: "Shares Owned", dataIndex: "shares", key: "shares" },
    { title: "Price per Share ($)", dataIndex: "price", key: "price" },
    { title: "Total Value ($)", dataIndex: "totalValue", key: "totalValue" },
  ];

  // Bar Chart Configuration
  const columnConfig = {
    data: chartData,
    xField: "category",
    yField: "value",
    color: ["#1890ff"],
    label: { position: "middle", style: { fill: "#fff" } },
    xAxis: { label: { autoHide: true, autoRotate: false } },
  };

  // Pie Chart Configuration
  const pieConfig = {
    data: pieData,
    angleField: "value",
    colorField: "type",
    radius: 0.9,
    label: {
      type: "inner",
      content: "{name} ({percentage})",
      style: { fontSize: 14 },
    },
  };

  return (
    <Content
      style={{ padding: "48px", minHeight: "100vh", background: "#f4f4f4" }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          background: "#ffffff",
          padding: "40px",
          borderRadius: "10px",
          boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)",
          textAlign: "center",
        }}
      >
        <h2>Stock Portfolio</h2>
        <p style={{ fontSize: "16px", color: "#555", marginBottom: "20px" }}>
          Track and manage your stock investments.
        </p>

        {/* Stock Addition Form */}
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          style={{ marginBottom: "30px" }}
        >
          <Form.Item
            label="Stock Name"
            name="stockName"
            rules={[{ required: true, message: "Enter stock name" }]}
          >
            <Input placeholder="Enter stock name (e.g. AAPL)" />
          </Form.Item>

          <Form.Item
            label="Shares Owned"
            name="sharesOwned"
            rules={[{ required: true, message: "Enter shares owned" }]}
          >
            <Input type="number" placeholder="Enter number of shares" />
          </Form.Item>

          <Form.Item
            label="Stock Price per Share ($)"
            name="stockPrice"
            rules={[{ required: true, message: "Enter stock price per share" }]}
          >
            <Input type="number" placeholder="Enter stock price" />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>
            Add Stock
          </Button>
        </Form>

        {/* Portfolio Overview */}
        {stocks.length > 0 && (
          <>
            <PortfolioPerformance stocks={sampleStocks} />
            <h3>Total Portfolio Value: ${totalValue.toFixed(2)}</h3>
            <Table
              dataSource={stocks}
              columns={columns}
              pagination={false}
              bordered
            />

            {/* Charts Section */}
            <div style={{ marginTop: "40px" }}>
              <h3>Portfolio Breakdown</h3>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{ width: "400px", height: "300px", margin: "10px" }}
                >
                  <Column {...columnConfig} />
                </div>
                <div
                  style={{ width: "400px", height: "300px", margin: "10px" }}
                >
                  <Pie {...pieConfig} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Content>
  );
};

export default Portfolio;
