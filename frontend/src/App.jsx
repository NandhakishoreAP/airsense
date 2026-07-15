import React, { useState } from 'react';
import MapView from './components/MapView';
import ForecastPanel from './components/ForecastPanel';
import AdvisoryPanel from './components/AdvisoryPanel';
import AttributionPanel from './components/AttributionPanel';
import EnforcementQueue from './components/EnforcementQueue';
import CityComparison from './components/CityComparison';
import ChatBox from './components/ChatBox';
import './layout.css';

export default function App() {
  const [selectedCity, setSelectedCity] = useState('Chennai');
  const [selectedLanguage, setSelectedLanguage] = useState('English');

  const handleCityChange = (e) => {
    setSelectedCity(e.target.value);
  };

  const handleLanguageChange = (e) => {
    setSelectedLanguage(e.target.value);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 3c-1 3-1.6 7-6 11.2C9.4 17.7 8.2 18 8 18" />
            <path d="M19 3a7.8 7.8 0 0 1-7.8 7.8" />
          </svg>
          <div className="brand-text">
            <h1>AirSense</h1>
            <span className="subtitle">Urban Air Quality Intelligence</span>
          </div>
        </div>
        <div className="controls">
          <label htmlFor="city-selector">Select City: </label>
          <select id="city-selector" value={selectedCity} onChange={handleCityChange}>
            <option value="Chennai">Chennai</option>
            <option value="Delhi">Delhi</option>
            <option value="Bengaluru">Bengaluru</option>
          </select>

          <label htmlFor="lang-selector" style={{ marginLeft: '1rem' }}>Language: </label>
          <select id="lang-selector" value={selectedLanguage} onChange={handleLanguageChange}>
            <option value="English">English</option>
            <option value="Tamil">Tamil</option>
            <option value="Hindi">Hindi</option>
          </select>
        </div>
      </header>

      <main className="dashboard-container">
        {/* Row 1: Map Full-Width (Step 2) */}
        <div className="row-map">
          <section className="map-section card card-map fade-in">
            <MapView selectedCity={selectedCity} />
          </section>
        </div>

        {/* Row 2: Triple columns (Step 2) */}
        <div className="row-triple">
          <div className="card card-forecast fade-in">
            <ForecastPanel selectedCity={selectedCity} />
          </div>
          <div className="card card-advisory fade-in">
            <AdvisoryPanel selectedCity={selectedCity} language={selectedLanguage} />
          </div>
          <div className="card card-attribution fade-in">
            <AttributionPanel selectedCity={selectedCity} />
          </div>
        </div>

        {/* Row 3: Double columns (Step 2) */}
        <div className="row-double">
          <section className="card card-enforcement fade-in">
            <EnforcementQueue selectedCity={selectedCity} />
          </section>
          <section className="card card-comparison fade-in">
            <CityComparison selectedCity={selectedCity} />
          </section>
        </div>

        {/* Row 4: Chat Full-Width (Step 2) */}
        <div className="row-chat">
          <section className="card card-chat fade-in">
            <ChatBox selectedCity={selectedCity} />
          </section>
        </div>
      </main>
    </div>
  );
}
