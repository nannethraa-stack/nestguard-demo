/**
 * NestGuard Hospital Gateway
 * Serves static web UI and bridges MQTT topics to WebSockets
 */
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');

const APP_PORT = 8080;
const BROKER_URL = 'mqtt://broker.hivemq.com:1883';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static assets from the root directory
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const mqttClient = mqtt.connect(BROKER_URL);
const alertHistory = [];

mqttClient.on('connect', () => {
    console.log('[CLINICAL BACKEND] Connected to Central MQTT Broker.');
    mqttClient.subscribe('nestguard/hospital/+/+/telemetry');
    mqttClient.subscribe('nestguard/hospital/+/+/alerts');
});

mqttClient.on('message', (topic, message) => {
    try {
        const parsed = JSON.parse(message.toString());
        const wsPacket = JSON.stringify({ topic, data: parsed });

        if (topic.includes('/alerts')) {
            alertHistory.unshift(parsed);
            if (alertHistory.length > 100) alertHistory.pop();
        }

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(wsPacket);
            }
        });
    } catch (e) {
        console.error('[CLINICAL BACKEND] Parse Error:', e.message);
    }
});

// Serve index.html on root request
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/v1/clinical/alerts', (req, res) => {
    res.json({ total: alertHistory.length, alerts: alertHistory });
});

server.listen(APP_PORT, () => {
    console.log(`[CLINICAL BACKEND] Server running on http://localhost:${APP_PORT}`);
});