/**
 * NestGuard Hospital Gateway + Built-in Telemetry Stub
 * Single process – ready for Render
 */
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');

const APP_PORT = process.env.PORT || 8080;          // Render injects PORT
const BROKER_URL = 'mqtt://broker.hivemq.com:1883';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const mqttClient = mqtt.connect(BROKER_URL, {
    clientId: 'nestguard_gateway_' + Math.random().toString(16).substr(2, 8),
    reconnectPeriod: 3000
});

const alertHistory = [];

// ---------- MQTT Bridge (same as before) ----------
mqttClient.on('connect', () => {
    console.log('[GATEWAY] Connected to HiveMQ');
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
        console.error('[GATEWAY] Parse Error:', e.message);
    }
});

// ---------- Built-in Hospital Stub (this was missing on Render) ----------
const TOPIC_TELEMETRY = 'nestguard/hospital/ward_a/bed_04/telemetry';
const TOPIC_ALERTS   = 'nestguard/hospital/ward_a/bed_04/alerts';

function startStub() {
    console.log('[STUB] Starting built-in NICU Bed 04 telemetry stream...');

    // 1 Hz Telemetry
    setInterval(() => {
        if (!mqttClient.connected) return;

        const fullThermalFrame = [];
        for (let row = 0; row < 24; row++) {
            for (let col = 0; col < 32; col++) {
                const isCenter = (row > 6 && row < 18) && (col > 10 && col < 22);
                const temp = isCenter
                    ? parseFloat((36.5 + Math.random() * 0.7).toFixed(1))
                    : parseFloat((24.0 + Math.random() * 0.5).toFixed(1));
                fullThermalFrame.push(temp);
            }
        }

        const ambientRoomVOC = Math.floor(110 + Math.random() * 20);
        const bedMattressVOC = Math.floor(125 + Math.random() * 30);

        const telemetryPayload = {
            hospitalId: 'METRO_GENERAL_NICU',
            wardId: 'WARD_A',
            bedId: 'BED_04',
            timestamp: new Date().toISOString(),
            sensors: {
                mlx90640: {
                    resolution: "32x24",
                    headTempC: parseFloat((36.8 + Math.random() * 0.3).toFixed(2)),
                    coreTempC: parseFloat((37.0 + Math.random() * 0.2).toFixed(2)),
                    thermalMatrix: fullThermalFrame
                },
                clinicalVitals: {
                    respirationBpm: Math.floor(34 + Math.random() * 8),
                    heartRateBpm: Math.floor(128 + Math.random() * 12),
                    ballistoCardiogramQuality: "98%",
                    movementIndex: "RESTING"
                },
                weightImu: {
                    loadWeightKg: parseFloat((4.25 + Math.random() * 0.05).toFixed(2)),
                    posture: "SUPINE_BACK",
                    stillnessScorePct: 92
                },
                audioCnn: {
                    cryDetected: Math.random() > 0.85,
                    decibels: Math.floor(38 + Math.random() * 12)
                },
                differentialHygiene: {
                    ambientRoomVocPpb: ambientRoomVOC,
                    mattressVocPpb: bedMattressVOC,
                    deltaVocPpb: bedMattressVOC - ambientRoomVOC,
                    diaperThresholdExceeded: false
                },
                incubatorEnvironment: {
                    airTempC: 31.5,
                    humidityPct: 55.0
                }
            }
        };

        mqttClient.publish(TOPIC_TELEMETRY, JSON.stringify(telemetryPayload));
    }, 1000);

    // Alerts every ~12 s
    setInterval(() => {
        if (!mqttClient.connected) return;

        const eventPool = [
            { eventType: 'RESPIRATORY_APNEA_WARNING', severity: 'CRITICAL', details: { respirationDropDurationSec: 8, heartRateBpm: 92 } },
            { eventType: 'CRY_DISTRESS_DETECTED', severity: 'HIGH', details: { audioConfidence: 0.94, decibels: 74, pattern: 'HUNGER' } },
            { eventType: 'POSTURE_ROLLOVER_ALERT', severity: 'HIGH', details: { currentPosture: 'PRONE_FACE_DOWN', riskLevel: 'AIRWAY' } },
            { eventType: 'CLINICAL_HYGIENE_EVENT', severity: 'MEDIUM', details: { deltaVocSpikePpb: 140, location: 'FOOT_ZONE' } },
            { eventType: 'HARDWARE_DIAGNOSTIC_WARNING', severity: 'LOW', details: { component: 'INMP441_MIC', status: 'BUFFER_OK' } }
        ];

        const selected = eventPool[Math.floor(Math.random() * eventPool.length)];

        const alertPayload = {
            hospitalId: 'METRO_GENERAL_NICU',
            bedId: 'BED_04',
            timestamp: new Date().toISOString(),
            eventType: selected.eventType,
            severity: selected.severity,
            details: selected.details
        };

        mqttClient.publish(TOPIC_ALERTS, JSON.stringify(alertPayload));
        console.log(`[STUB] Fired alert: ${alertPayload.eventType}`);
    }, 12000);
}

// Start the stub only after MQTT is connected
mqttClient.on('connect', () => {
    startStub();
});

// ---------- Routes ----------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/v1/clinical/alerts', (req, res) => {
    res.json({ total: alertHistory.length, alerts: alertHistory });
});

// ---------- Start ----------
server.listen(APP_PORT, () => {
    console.log(`[GATEWAY] Running on port ${APP_PORT}`);
});
