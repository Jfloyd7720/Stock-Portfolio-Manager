import React, { useState, useEffect } from "react";
import { Line } from "react-chartjs-2";
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

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const StockChart = ({ symbol, days }) => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const FMP_API_KEY = "bvGShko3CAWKMcOe6vQ9hew2nQOgrAFY"; // Replace with your FMP API key

  useEffect(() => {
    if (!symbol) return;

    const fetchStockData = async () => {
      try {
        const response = await axios.get(
          `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}`,
          {
            params: { apikey: FMP_API_KEY },
          }
        );

        const data = response.data.historical;
        if (data) {
          // Get the last selected number of days and reverse order for display
          const labels = data
            .slice(0, days)
            .map((entry) => entry.date)
            .reverse();
          const prices = data
            .slice(0, days)
            .map((entry) => entry.close)
            .reverse();

          setChartData({
            labels,
            datasets: [
              {
                label: `${symbol} Stock Price (Last ${days} Days)`,
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
  }, [symbol, days]);

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
