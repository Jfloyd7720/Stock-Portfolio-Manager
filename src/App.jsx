import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { Breadcrumb, Layout, Menu, theme } from "antd";
import StockCalculator from "./StockCalculator";
import Portfolio from "./Portfolio";
import Home from "./Home";

const { Header, Content, Footer } = Layout;

const App = () => {
  return (
    <Router>
      <Layout>
        {/* Navigation Bar */}
        <Header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            width: "100%",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
          }}
        >
          <div className="demo-logo" style={{ flex: 1 }} />
          <Menu theme="dark" mode="horizontal" defaultSelectedKeys={["1"]}>
            <Menu.Item key="1">
              <Link to="/">Home</Link>
            </Menu.Item>
            <Menu.Item key="2">
              <Link to="/portfolio">Portfolio</Link>
            </Menu.Item>
            <Menu.Item key="3">
              <Link to="/stock-calculator">Stock Calculator</Link>
            </Menu.Item>
          </Menu>
        </Header>

        {/* Page Content */}
        <Content style={{ padding: "0 48px" }}>
          <Breadcrumb style={{ margin: "16px 0" }}>
            <Breadcrumb.Item></Breadcrumb.Item>
          </Breadcrumb>

          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/stock-calculator" element={<StockCalculator />} />
          </Routes>
        </Content>

        {/* Footer */}
        <Footer style={{ textAlign: "center" }}>
          Stock Calculator ©{new Date().getFullYear()} Created by Jeff Floyd
        </Footer>
      </Layout>
    </Router>
  );
};

export default App;
