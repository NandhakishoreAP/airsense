import React, { useState } from 'react';
import MapView from './components/MapView';
import ForecastPanel from './components/ForecastPanel';
import AdvisoryPanel from './components/AdvisoryPanel';
import AttributionPanel from './components/AttributionPanel';
import EnforcementQueue from './components/EnforcementQueue';
import CityComparison from './components/CityComparison';
import ChatBox from './components/ChatBox';

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
        <h1>AirSense — Urban Air Quality Intelligence Platform</h1>
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

      <main className="app-layout">
        <section className="map-section">
          <MapView selectedCity={selectedCity} />
        </section>

        <section className="panels-section">
          <ForecastPanel selectedCity={selectedCity} />
          <AdvisoryPanel selectedCity={selectedCity} selectedLanguage={selectedLanguage} />
          <AttributionPanel selectedCity={selectedCity} />
        </section>

        <section className="utility-section">
          <EnforcementQueue selectedCity={selectedCity} />
          <CityComparison selectedCity={selectedCity} />
          <ChatBox selectedCity={selectedCity} />
        </section>
      </main>
    </div>
  );
}
