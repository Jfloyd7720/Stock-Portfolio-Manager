import React, { useState, useEffect } from "react";
import { Line } from "react-chartjs-2"; // Import Line chart from chart.js
import axios from "axios";
import { Card, message, Spin } from "antd";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register the necessary Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const StockChart = ({ symbol = "TSLA" }) => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const FMP_API_KEY = "bvGShko3CAWKMcOe6vQ9hew2nQOgrAFY"; // Replace with your FMP API key

  useEffect(() => {
    const fetchStockData = async () => {
      try {
        const response = await axios.get(
          `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}`,
          {
            params: {
              apikey: FMP_API_KEY, // Add your API key
            },
          }
        );

        const data = response.data.historical;
        if (data) {
          // Reverse the data so the most recent date is last in the chart
          const labels = data
            .slice(0, 10)
            .map((entry) => entry.date)
            .reverse(); // Reverse the order of dates
          const prices = data
            .slice(0, 10)
            .map((entry) => entry.close)
            .reverse(); // Reverse the order of prices

          setChartData({
            labels,
            datasets: [
              {
                label: `${symbol} Stock Price (Last 10 Days)`,
                data: prices,
                borderColor: "rgba(75, 192, 192, 1)",
                tension: 0.1,
                fill: false,
              },
            ],
          });
        } else {
          message.error("Unable to fetch stock data.");
        }
      } catch (error) {
        message.error("Error fetching stock data.");
      } finally {
        setLoading(false);
      }
    };

    fetchStockData();
  }, [symbol]); // Trigger fetch when the symbol changes

  if (loading) {
    return <Spin style={{ marginTop: "20px" }} />;
  }

  return (
    <Card title={`Stock Chart for ${symbol}`} style={{ marginTop: "20px" }}>
      {chartData && <Line data={chartData} />}
    </Card>
  );
};

export default StockChart;
