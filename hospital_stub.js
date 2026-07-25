/**
 * NestGuard Clinical & Consumer Hybrid Telemetry & Edge AI Stub
 * Perfectly synchronized with index.html UI
 */
const mqtt = require('mqtt');

const BROKER_URL = 'mqtt://broker.hivemq.com:1883';
const CLIENT_ID = 'nestguard_nicu_bed_04_' + Math.random().toString(16).substring(2, 8);
const client = mqtt.connect(BROKER_URL, { clientId: CLIENT_ID });

const TOPIC_TELEMETRY = 'nestguard/hospital/ward_a/bed_04/telemetry';
const TOPIC_ALERTS = 'nestguard/hospital/ward_a/bed_04/alerts';

client.on('connect', () => {
    console.log(`[HOSPITAL STUB] Connected to Central Broker: ${BROKER_URL}`);
    console.log(`[HOSPITAL STUB] Streaming NICU Bed 04 High-Res Telemetry...`);

    // 1. High-Density 1 Hz Telemetry Stream
    setInterval(() => {
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
                // 1. MLX90640 Spatial Thermal Array
                mlx90640: {
                    resolution: "32x24",
                    headTempC: parseFloat((36.8 + Math.random() * 0.3).toFixed(2)),
                    coreTempC: parseFloat((37.0 + Math.random() * 0.2).toFixed(2)),
                    thermalMatrix: fullThermalFrame
                },
                // 2 & 3. mmWave Radar + PVDF Vitals
                clinicalVitals: {
                    respirationBpm: Math.floor(34 + Math.random() * 8),
                    heartRateBpm: Math.floor(128 + Math.random() * 12),
                    ballistoCardiogramQuality: "98%",
                    movementIndex: "RESTING"
                },
                // 4. HX711 Load Cell + MPU6050 IMU
                weightImu: {
                    loadWeightKg: parseFloat((4.25 + Math.random() * 0.05).toFixed(2)),
                    posture: "SUPINE_BACK",
                    stillnessScorePct: 92
                },
                // 5. INMP441 Microphone Audio CNN
                audioCnn: {
                    cryDetected: Math.random() > 0.8,
                    decibels: Math.floor(38 + Math.random() * 12)
                },
                // 6. Dual ENS160 Gas Array
                differentialHygiene: {
                    ambientRoomVocPpb: ambientRoomVOC,
                    mattressVocPpb: bedMattressVOC,
                    deltaVocPpb: bedMattressVOC - ambientRoomVOC,
                    diaperThresholdExceeded: false
                },
                // 7. AHT20 Incubator Climate
                incubatorEnvironment: {
                    airTempC: 31.5,
                    humidityPct: 55.0
                }
            }
        };

        client.publish(TOPIC_TELEMETRY, JSON.stringify(telemetryPayload));
        console.log(`[STUB -> CLINICAL MQTT] Published Full Telemetry Frame`);
    }, 1000);

    // 2. Alert Trigger Simulator (Fires every 12 seconds)
    setInterval(() => {
        const eventPool = [
            { eventType: 'RESPIRATORY_APNEA_WARNING', severity: 'CRITICAL', details: { respirationDropDurationSec: 8, heartRateBpm: 92 } },
            { eventType: 'CRY_DISTRESS_DETECTED', severity: 'HIGH', details: { audioConfidence: 0.94, decibels: 74, pattern: 'HUNGER' } },
            { eventType: 'POSTURE_ROLLOVER_ALERT', severity: 'HIGH', details: { currentPosture: 'PRONE_FACE_DOWN', riskLevel: 'AIRWAY' } },
            { eventType: 'CLINICAL_HYGIENE_EVENT', severity: 'MEDIUM', details: { deltaVocSpikePpb: 140, location: 'FOOT_ZONE' } },
            { eventType: 'HARDWARE_DIAGNOSTIC_WARNING', severity: 'LOW', details: { component: 'INMP441_MIC', status: 'BUFFER_OK' } }
        ];

        const selectedEvent = eventPool[Math.floor(Math.random() * eventPool.length)];

        const alertPayload = {
            hospitalId: 'METRO_GENERAL_NICU',
            bedId: 'BED_04',
            timestamp: new Date().toISOString(),
            eventType: selectedEvent.eventType,
            severity: selectedEvent.severity,
            details: selectedEvent.details
        };

        client.publish(TOPIC_ALERTS, JSON.stringify(alertPayload));
        console.log(`[STUB ALERT -> MQTT] *** FIRED EVENT: ${alertPayload.eventType} ***`);
    }, 12000);
});