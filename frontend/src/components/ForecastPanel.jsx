import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';

import { getAqiCurrent, getAqiForecast } from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

function formatMethod(method) {
  if (!method) return 'Unknown';
  if (method === 'naive_fallback_no_model_yet') {
    return 'naive (based on most recent reading)';
  }
  if (method === 'xgboost_model') {
    return 'XGBoost model';
  }
  if (method === 'no_data_available') {
    return 'no data available';
  }
  return method;
}

export default function ForecastPanel({ city, selectedCity }) {
  const activeCity = city || selectedCity;
  const [currentAqi, setCurrentAqi] = useState(null);
  const [forecast24, setForecast24] = useState(null);
  const [forecast48, setForecast48] = useState(null);
  const [forecast72, setForecast72] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchData = (isMounted) => {
    setLoading(true);
    setErrors({});
    setCurrentAqi(null);
    setForecast24(null);
    setForecast48(null);
    setForecast72(null);

    const fetchCurrent = getAqiCurrent(activeCity)
      .then(res => { if (isMounted) setCurrentAqi(res); })
      .catch(err => { if (isMounted) setErrors(prev => ({ ...prev, current: `Current AQI: ${err.message || 'Failed'}` })); });

    const fetch24 = getAqiForecast(activeCity, 24)
      .then(res => { if (isMounted) setForecast24(res); })
      .catch(err => { if (isMounted) setErrors(prev => ({ ...prev, f24: `24h Forecast: ${err.message || 'Failed'}` })); });

    const fetch48 = getAqiForecast(activeCity, 48)
      .then(res => { if (isMounted) setForecast48(res); })
      .catch(err => { if (isMounted) setErrors(prev => ({ ...prev, f48: `48h Forecast: ${err.message || 'Failed'}` })); });

    const fetch72 = getAqiForecast(activeCity, 72)
      .then(res => { if (isMounted) setForecast72(res); })
      .catch(err => { if (isMounted) setErrors(prev => ({ ...prev, f72: `72h Forecast: ${err.message || 'Failed'}` })); });

    Promise.all([fetchCurrent, fetch24, fetch48, fetch72]).then(() => {
      if (isMounted) {
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    let isMounted = true;
    fetchData(isMounted);
    return () => {
      isMounted = false;
    };
  }, [activeCity]);

  const handleRetry = () => {
    fetchData(true);
  };

  // Helper function to read CSS variables
  const getThemeValue = (varName, fallback) => {
    if (typeof window === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
  };

  if (loading) {
    return (
      <div className="panel-loading">
        <div>Loading AQI forecast for {activeCity}...</div>
      </div>
    );
  }

  const labels = [];
  const dataPoints = [];

  if (currentAqi && currentAqi.aqi_value !== undefined && currentAqi.aqi_value !== null) {
    labels.push('Now');
    dataPoints.push(currentAqi.aqi_value);
  }
  if (forecast24 && forecast24.predicted_aqi !== null && forecast24.predicted_aqi !== undefined) {
    labels.push('+24h');
    dataPoints.push(forecast24.predicted_aqi);
  }
  if (forecast48 && forecast48.predicted_aqi !== null && forecast48.predicted_aqi !== undefined) {
    labels.push('+48h');
    dataPoints.push(forecast48.predicted_aqi);
  }
  if (forecast72 && forecast72.predicted_aqi !== null && forecast72.predicted_aqi !== undefined) {
    labels.push('+72h');
    dataPoints.push(forecast72.predicted_aqi);
  }

  if (dataPoints.length === 0) {
    return (
      <div className="panel-error">
        <div className="card-title-container">
          <svg className="card-icon icon-forecast" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
          </svg>
          <h3 className="card-title">Forecast Panel</h3>
        </div>
        <p>No current AQI or forecast data available yet for {activeCity}.</p>
        <button onClick={handleRetry} className="btn">Retry</button>
      </div>
    );
  }

  const method = (forecast24 && forecast24.method) || (forecast48 && forecast48.method) || (forecast72 && forecast72.method);

  const accentColor = getThemeValue('--accent', '#0d9488');
  const borderColorValue = getThemeValue('--border', '#e4e7eb');
  const textPrimary = getThemeValue('--text-primary', '#1a1d23');
  const textSecondary = getThemeValue('--text-secondary', '#6b7280');
  const fontSans = getThemeValue('--font-sans', "'Inter', sans-serif");

  const data = {
    labels,
    datasets: [
      {
        label: `${activeCity} Predicted AQI Trend`,
        data: dataPoints,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.12)', // soft fill area under line (Part 5)
        fill: true, // enable filled area
        borderWidth: 3,
        pointBackgroundColor: '#3B82F6',
        pointBorderColor: '#FFFFFF', // white border around dots
        pointBorderWidth: 2,
        pointRadius: 5.5, // 5.5px point radius (Part 5)
        pointHoverRadius: 8,
        tension: 0.25,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: textPrimary,
          font: {
            family: fontSans,
            size: 12,
            weight: '600'
          }
        }
      },
      tooltip: {
        enabled: true,
        titleFont: { family: fontSans },
        bodyFont: { family: fontSans }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: borderColorValue,
          drawBorder: false
        },
        ticks: {
          color: textSecondary,
          font: { family: fontSans }
        },
        title: {
          display: true,
          color: textPrimary,
          text: 'AQI Value',
          font: {
            family: fontSans,
            weight: 'bold'
          }
        }
      },
      x: {
        grid: {
          color: borderColorValue,
          drawBorder: false
        },
        ticks: {
          color: textSecondary,
          font: { family: fontSans }
        },
        title: {
          display: true,
          color: textPrimary,
          text: 'Time Horizon',
          font: {
            family: fontSans,
            weight: 'bold'
          }
        }
      }
    }
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="forecast-panel-container panel-container">
      <div className="card-title-container">
        <svg className="card-icon icon-forecast" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
        </svg>
        <h3 className="card-title">Forecast Dynamics for {activeCity}</h3>
      </div>

      {/* Render line chart */}
      <div className="chart-wrapper">
        <Line data={data} options={chartOptions} />
      </div>

      {/* Method description */}
      {method && (
        <div className="panel-subtitle">
          <strong>Forecast method:</strong> {formatMethod(method)}
        </div>
      )}

      {/* Error warnings if any partial calls failed */}
      {hasErrors && (
        <div className="error-banner">
          <strong>⚠️ Some data was unavailable:</strong>
          <ul>
            {Object.entries(errors).map(([key, msg]) => (
              <li key={key}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
