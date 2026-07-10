import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';

import { getAqiCurrent, getAqiForecast } from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '250px', border: '1px solid #ddd', borderRadius: '8px', background: '#fcfcfc', padding: '1rem', boxSizing: 'border-box' }}>
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
      <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', background: '#fff5f5', minHeight: '250px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <h3 style={{ margin: '0 0 10px 0' }}>Forecast Panel</h3>
        <p style={{ color: '#cc0000', margin: '0 0 15px 0', textAlign: 'center' }}>No current AQI or forecast data available yet for {activeCity}.</p>
        <button onClick={handleRetry} style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px' }}>Retry</button>
      </div>
    );
  }

  const method = (forecast24 && forecast24.method) || (forecast48 && forecast48.method) || (forecast72 && forecast72.method);

  const data = {
    labels,
    datasets: [
      {
        label: `${activeCity} Predicted AQI Trend`,
        data: dataPoints,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderWidth: 2.5,
        pointBackgroundColor: 'rgb(54, 162, 235)',
        pointRadius: 5,
        pointHoverRadius: 7,
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
      },
      tooltip: {
        enabled: true,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'AQI Value',
          font: { weight: 'bold' }
        }
      },
      x: {
        title: {
          display: true,
          text: 'Time Horizon',
          font: { weight: 'bold' }
        }
      }
    }
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="forecast-panel-container" style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', background: '#fff', minHeight: '320px', boxSizing: 'border-box' }}>
      <h3 style={{ margin: '0 0 10px 0' }}>Forecast Dynamics for {activeCity}</h3>

      {/* Render line chart */}
      <div style={{ height: '220px', position: 'relative' }}>
        <Line data={data} options={chartOptions} />
      </div>

      {/* Method description */}
      {method && (
        <div style={{ marginTop: '12px', fontSize: '0.85rem', color: '#555', fontStyle: 'italic' }}>
          <strong>Forecast method:</strong> {formatMethod(method)}
        </div>
      )}

      {/* Error warnings if any partial calls failed */}
      {hasErrors && (
        <div style={{ padding: '8px 12px', background: '#fff9e6', border: '1px solid #ffe0b2', borderRadius: '4px', marginTop: '12px', fontSize: '0.8rem', color: '#b78103' }}>
          <strong>⚠️ Some data was unavailable:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {Object.entries(errors).map(([key, msg]) => (
              <li key={key}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
