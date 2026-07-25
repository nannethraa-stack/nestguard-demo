const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const path = require('path');
const { fork } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

// 1. AUTO-SPAWN HARDWARE SIMULATOR (FOR CLOUD DEPLOYMENTS)
// Automatically launches hospital_stub.js in a child process on Render
try {
    const simulatorPath = path.join(__dirname, 'hospital_stub.js');
    console.log(`[SYSTEM] Auto-starting hardware simulator background process: ${simulatorPath}`);
    
    // stdio: 'inherit' routes stub console.logs directly to Render terminal logs
    const simulator = fork(simulatorPath, [], { stdio: 'inherit' });

    simulator.on('exit', (code, signal) => {
        console.error(`[SIMULATOR EXIT] Background process exited with code ${code} and signal ${signal}`);
    });
} catch (err) {
    console.warn('[SYSTEM] Could not auto-start hospital_stub.js:', err.message);
}

// 2. EXPRESS HTTP SERVER & STATIC FILE HOSTING
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'active', 
        system: 'NestGuard IoMT Gateway', 
        timestamp: new Date().toISOString() 
    });
});

const server = http.createServer(app);

// 3. WEBSOCKET SERVER FOR DASHBOARD CLIENTS
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('[WEBSOCKET] Web dashboard client connected');
    
    ws.send(JSON.stringify({
        type: 'SYSTEM_STATUS',
        message: 'Connected to NestGuard IoMT Telemetry Gateway'
    }));

    ws.on('close', () => {
        console.log('[WEBSOCKET] Web dashboard client disconnected');
    });
});

// Broadcast helper to stream payloads to all connected browser clients
function broadcastTelemetry(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// 4. MQTT CLIENT (CONNECTED TO HIVEMQ BROKER)
const MQTT_BROKER = 'mqtt://broker.hivemq.com:1883';
// Use '#' wildcard so it catches 'bed_04', 'bed04', or any other subtopic format
const MQTT_TOPIC = 'nestguard/nicu/#';

console.log(`[MQTT] Connecting to broker at ${MQTT_BROKER}...`);
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
    console.log('[MQTT] Connected to HiveMQ Broker successfully');
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
        if (!err) {
            console.log(`[MQTT] Subscribed to topic pattern: ${MQTT_TOPIC}`);
        } else {
            console.error('[MQTT] Subscription error:', err);
        }
    });
});

mqttClient.on('message', (topic, message) => {
    try {
        const rawString = message.toString();
        const payload = JSON.parse(rawString);
        
        // Extract vital signals with flexible key fallbacks
        const hr = payload.hr || payload.heart_rate || payload.pulse || 'N/A';
        const coreTemp = payload.core_temp || payload.coreTemp || 'N/A';
        
        console.log(`[MQTT RELAY] Topic: ${topic} | HR: ${hr} | Core Temp: ${coreTemp}°C`);
        
        // Stream data payload to all connected frontend dashboards
        broadcastTelemetry(payload);
    } catch (err) {
        console.error('[MQTT PARSE ERROR] Invalid JSON received:', message.toString());
    }
});

mqttClient.on('error', (err) => {
    console.error('[MQTT ERROR]', err);
});

// 5. START GATEWAY SERVER
server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 NestGuard IoMT Server running on port ${PORT}`);
    console.log(`🌐 Local Web Dashboard: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
