import React, { useState, useEffect } from 'react';
import { getAttribution } from '../api';

function getConfidenceClass(confidence) {
  if (!confidence) return 'badge-confidence-unknown';
  switch (confidence.toLowerCase()) {
    case 'high':
      return 'badge-confidence-high';
    case 'moderate':
      return 'badge-confidence-moderate';
    case 'low':
      return 'badge-confidence-low';
    default:
      return 'badge-confidence-unknown';
  }
}

export default function AttributionPanel({ city, selectedCity }) {
  const activeCity = city || selectedCity;
  const [attribution, setAttribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = (isMounted) => {
    setLoading(true);
    setError(null);
    setAttribution(null);

    getAttribution(activeCity)
      .then((res) => {
        if (isMounted) {
          setAttribution(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error(err);
          const errMsg = err.message || '';
          if (errMsg.includes('404')) {
            setError('No attribution available yet for this city');
          } else {
            setError(errMsg || 'Failed to load source attribution reasoning.');
          }
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
      <div className="panel-loading">
        <div>Reasoning about pollution sources...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-error">
        <div className="card-title-container">
          <svg className="card-icon icon-attribution" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <h3 className="card-title">Source Attribution</h3>
        </div>
        <p>{error}</p>
        <button onClick={handleRetry} className="btn">Retry</button>
      </div>
    );
  }

  if (!attribution) {
    return null;
  }

  return (
    <div className="attribution-panel-container panel-container">
      <div className="panel-footer-meta">
        <div className="card-title-container">
          <svg className="card-icon icon-attribution" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <h3 className="card-title">Source Attribution Reasoning ({activeCity})</h3>
        </div>
        
        {/* Confidence Badge using the same style pattern */}
        <span className={`badge ${getConfidenceClass(attribution.confidence)}`}>
          Confidence: {attribution.confidence || 'Unknown'}
        </span>
      </div>

      <div className="attribution-box">
        {attribution.reasoning}
      </div>

      <div className="panel-footer-meta">
        <span>Based on AQI Level: <strong style={{ color: 'var(--text-primary)' }}>{attribution.aqi_value}</strong></span>
      </div>

      {attribution.error && (
        <div className="error-banner">
          ⚠️ Live attribution generation is temporarily unavailable — showing a general fallback message
        </div>
      )}
    </div>
  );
}
