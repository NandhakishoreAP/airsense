import React, { useState, useEffect } from 'react';
import { getAttribution } from '../api';

function getConfidenceStyles(confidence) {
  if (!confidence) return { bg: '#e2e3e5', text: '#383d41', border: '#d6d8db' };
  switch (confidence.toLowerCase()) {
    case 'high':
      return { bg: '#d4edda', text: '#155724', border: '#c3e6cb' };
    case 'moderate':
      return { bg: '#fff3cd', text: '#856404', border: '#ffeeba' };
    case 'low':
      return { bg: '#f8d7da', text: '#721c24', border: '#f5c6cb' };
    default:
      return { bg: '#e2e3e5', text: '#383d41', border: '#d6d8db' };
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', border: '1px solid #ddd', borderRadius: '8px', background: '#fcfcfc', padding: '1rem', boxSizing: 'border-box' }}>
        <div>Reasoning about pollution sources...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', background: '#fff5f5', minHeight: '180px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <h3 style={{ margin: '0 0 10px 0' }}>Source Attribution</h3>
        <p style={{ color: '#cc0000', margin: '0 0 15px 0', textAlign: 'center', fontWeight: 'bold' }}>{error}</p>
        <button onClick={handleRetry} style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px' }}>Retry</button>
      </div>
    );
  }

  if (!attribution) {
    return null;
  }

  const confidenceStyles = getConfidenceStyles(attribution.confidence);

  return (
    <div className="attribution-panel-container" style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', background: '#fff', minHeight: '180px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Source Attribution Reasoning ({activeCity})</h3>
        
        {/* Confidence Badge */}
        <span style={{
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '0.8rem',
          fontWeight: 'bold',
          background: confidenceStyles.bg,
          color: confidenceStyles.text,
          border: `1px solid ${confidenceStyles.border}`,
          textTransform: 'uppercase'
        }}>
          Confidence: {attribution.confidence || 'Unknown'}
        </span>
      </div>

      <div style={{
        padding: '1rem',
        borderRadius: '6px',
        background: '#f8f9fa',
        borderLeft: '4px solid #17a2b8',
        margin: '10px 0',
        fontSize: '1.05rem',
        lineHeight: '1.6',
        color: '#2c3e50',
        fontWeight: '500'
      }}>
        {attribution.reasoning}
      </div>

      <div style={{ fontSize: '0.8rem', color: '#7f8c8d', marginTop: '8px' }}>
        Based on AQI Level: <strong style={{ color: '#2c3e50' }}>{attribution.aqi_value}</strong>
      </div>

      {attribution.error && (
        <div style={{ marginTop: '12px', padding: '8px 12px', background: '#fff3cd', border: '1px solid #ffeeba', color: '#856404', borderRadius: '4px', fontSize: '0.85rem' }}>
          ⚠️ Live attribution generation is temporarily unavailable — showing a general fallback message
        </div>
      )}
    </div>
  );
}
