/**
 * NestGuard Hospital Gateway
 * Serves static web UI, auto-spawns hardware simulator, and bridges MQTT topics to WebSockets
 */
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');
const { fork } = require('child_process');

const APP_PORT = process.env.PORT || 8080;
const BROKER_URL = 'mqtt://broker.hivemq.com:1883';

// 1. AUTO-SPAWN HARDWARE SIMULATOR FOR CLOUD HOSTING
try {
    const simulatorPath = path.join(__dirname, 'hospital_stub.js');
    console.log(`[CLINICAL BACKEND] Auto-starting hardware simulator: ${simulatorPath}`);
    
    // Inherit stdio so simulator output displays in Render/Terminal logs
    const simulator = fork(simulatorPath, [], { stdio: 'inherit' });

    simulator.on('exit', (code, signal) => {
        console.error(`[SIMULATOR EXIT] Process exited with code ${code} and signal ${signal}`);
    });
} catch (err) {
    console.warn('[CLINICAL BACKEND] Could not auto-start hospital_stub.js:', err.message);
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve static assets from root directory
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 2. MQTT CLIENT CONNECTION & SUBSCRIPTION
const mqttClient = mqtt.connect(BROKER_URL);
const alertHistory = [];

mqttClient.on('connect', () => {
    console.log('[CLINICAL BACKEND] Connected to Central MQTT Broker.');
    // Subscribe to wildcard pattern to catch all clinical and NICU topics
    mqttClient.subscribe('nestguard/#', (err) => {
        if (!err) {
            console.log('[CLINICAL BACKEND] Subscribed to topic pattern: nestguard/#');
        }
    });
});

mqttClient.on('message', (topic, message) => {
    try {
        const parsed = JSON.parse(message.toString());
        
        // Log telemetry directly in output
        const hr = parsed.hr || parsed.heart_rate || 'N/A';
        const coreTemp = parsed.core_temp || parsed.coreTemp || 'N/A';
        console.log(`[MQTT RELAY] ${topic} -> HR: ${hr} | Temp: ${coreTemp}°C`);

        if (topic.includes('/alerts') || parsed.alert_event || parsed.cry_distress) {
            alertHistory.unshift(parsed);
            if (alertHistory.length > 100) alertHistory.pop();
        }

        // Send payload directly to all connected WebSockets
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(parsed));
            }
        });
    } catch (e) {
        console.error('[CLINICAL BACKEND] Parse Error:', e.message);
    }
});

// REST API Endpoints
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/v1/clinical/alerts', (req, res) => {
    res.json({ total: alertHistory.length, alerts: alertHistory });
});

server.listen(APP_PORT, () => {
    console.log(`[CLINICAL BACKEND] Server running on http://localhost:${APP_PORT}`);
});
