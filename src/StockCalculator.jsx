import React, { useState } from "react";
import { Layout, Input, Button, Form, Table, Carousel } from "antd";
import { Column, Pie } from "@ant-design/plots"; // AntD Charts

const { Content } = Layout;

const StockCalculator = () => {
  const [form] = Form.useForm();
  const [tableData, setTableData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [cashData, setCashData] = useState([]);
  const [showResults, setShowResults] = useState(false); // Control form visibility
  const exchangeRate = 1.3; // 1 GBP = X USD

  const onFinish = (values) => {
    const { currentShares, currentPrice, newShares, newPrice, cashAvailable } =
      values;

    const curShares = parseFloat(currentShares);
    const curPrice = parseFloat(currentPrice);
    const addShares = parseFloat(newShares);
    const addPrice = parseFloat(newPrice);
    const cashGBP = parseFloat(cashAvailable);

    // Convert GBP to USD
    const cashUSD = cashGBP * exchangeRate;

    // Calculate new average price
    const totalShares = curShares + addShares;
    const totalCost = curShares * curPrice + addShares * addPrice;
    const newAvgPrice = totalCost / totalShares;

    // Calculate remaining cash
    const costOfNewPurchase = addShares * addPrice;
    const remainingCashUSD = cashUSD - costOfNewPurchase;
    const remainingCashGBP = remainingCashUSD / exchangeRate;

    // Update table data
    setTableData([
      {
        key: "1",
        label: "New Average Price ($)",
        value: `$${newAvgPrice.toFixed(2)}`,
      },
      {
        key: "2",
        label: "Remaining Cash (£)",
        value: `£${remainingCashGBP.toFixed(2)}`,
      },
      {
        key: "3",
        label: "Total Shares",
        value: `${totalShares.toFixed(2)}`,
      },
    ]);

    // Chart data for Shares Before & After
    setChartData([
      { category: "Before Purchase", shares: curShares },
      { category: "After Purchase", shares: totalShares },
    ]);

    // Chart data for Cash Allocation
    setCashData([
      {
        type: "Spent on Stocks",
        value: costOfNewPurchase / exchangeRate,
      },
      { type: "Remaining Cash", value: remainingCashGBP },
    ]);

    // Show results and hide form
    setShowResults(true);
  };

  const columns = [
    { title: "Description", dataIndex: "label", key: "label" },
    { title: "Value", dataIndex: "value", key: "value" },
  ];

  // Chart Configuration - Shares Bar Chart
  const columnConfig = {
    data: chartData,
    xField: "category",
    yField: "shares",
    color: ["#1890ff", "#52c41a"],
    label: {
      position: "middle",
      style: { fill: "#fff" },
    },
    xAxis: { label: { autoHide: true, autoRotate: false } },
  };

  // Chart Configuration - Cash Pie Chart
  const pieConfig = {
    data: cashData,
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
          maxWidth: "800px",
          margin: "0 auto",
          background: "#ffffff",
          padding: "40px",
          borderRadius: "10px",
          boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)",
          textAlign: "center",
        }}
      >
        <h2 style={{ marginBottom: "20px" }}>Stock Average Price Calculator</h2>
        <p style={{ marginBottom: "20px", fontSize: "16px", color: "#555" }}>
          Exchange Rate: <strong>1 GBP = {exchangeRate} USD</strong>
        </p>

        {/* Hide form after submission */}
        {!showResults ? (
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            style={{ width: "100%" }}
          >
            <Form.Item
              label="Current Shares Owned"
              name="currentShares"
              rules={[{ required: true, message: "Enter current shares" }]}
            >
              <Input type="number" placeholder="Enter current shares" />
            </Form.Item>

            <Form.Item
              label="Current Average Price ($)"
              name="currentPrice"
              rules={[{ required: true, message: "Enter current price" }]}
            >
              <Input type="number" placeholder="Enter current avg price" />
            </Form.Item>

            <Form.Item
              label="New Shares to Buy"
              name="newShares"
              rules={[{ required: true, message: "Enter new shares" }]}
            >
              <Input type="number" placeholder="Enter new shares" />
            </Form.Item>

            <Form.Item
              label="New Purchase Price ($)"
              name="newPrice"
              rules={[{ required: true, message: "Enter new price" }]}
            >
              <Input type="number" placeholder="Enter new purchase price" />
            </Form.Item>

            <Form.Item
              label="Total Cash Available (£)"
              name="cashAvailable"
              rules={[{ required: true, message: "Enter available cash" }]}
            >
              <Input type="number" placeholder="Enter available cash (£)" />
            </Form.Item>

            <Button type="primary" htmlType="submit" block>
              Calculate
            </Button>
          </Form>
        ) : (
          // Results Section
          <div>
            <h3 style={{ marginTop: "20px" }}>Calculation Results</h3>
            <Table
              dataSource={tableData}
              columns={columns}
              pagination={false}
              bordered
            />

            <Carousel
              style={{ marginTop: "20px", width: "100%" }}
              dots={true}
              swipeable={true}
              draggable={true}
            >
              <div>
                <h3>Shares Before & After</h3>
                <Column {...columnConfig} />
              </div>
              <div>
                <h3>Cash Allocation</h3>
                <Pie {...pieConfig} />
              </div>
            </Carousel>

            <Button
              type="default"
              style={{ marginTop: "20px" }}
              onClick={() => setShowResults(false)}
            >
              Reset Calculator
            </Button>
          </div>
        )}
      </div>
    </Content>
  );
};

export default StockCalculator;
