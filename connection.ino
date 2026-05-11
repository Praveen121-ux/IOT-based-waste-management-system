#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "HX711.h"

// ================= WIFI =================
const char* ssid = "iPhone";
const char* password = "ronaldo123";

// ================= SERVER =================
String serverURL = "https://smart-waste-server-p598.onrender.com/api/data";

// ================= LCD =================
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ================= PINS =================
#define TRIG 18
#define ECHO 19
#define IR_SENSOR 23
#define SERVO_PIN 13
#define GAS_SENSOR 34

// HX711
#define DT 25
#define SCK 26

// GSM
#define RXD2 16
#define TXD2 17

// ================= OBJECTS =================
Servo myServo;
HX711 scale;

// ================= FLAGS =================
bool smsSent = false;
bool callMade = false;
bool gasAlertSent = false;

bool weightSmsSent = false;
bool weightCallMade = false;
bool isOverweight = false;

unsigned long fullStartTime = 0;
bool isFull = false;

unsigned long weightStartTime = 0;

unsigned long gasStartTime = 0;
bool gasTimerStarted = false;

// ================= THRESHOLDS =================
int gasThreshold = 1000;

float calibration_factor = -7050;

float weightThreshold = 10;

// ================= TIMERS =================
unsigned long lastSendTime = 0;

void setup() {

  Serial.begin(115200);

  // GSM Serial
  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);

  // I2C
  Wire.begin(21, 22);

  // LCD
  lcd.begin(16, 2);
  lcd.backlight();
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("SMART DUSTBIN");

  // PIN MODES
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(IR_SENSOR, INPUT);
  pinMode(GAS_SENSOR, INPUT);

  // SERVO
  myServo.attach(SERVO_PIN);
  myServo.write(0);

  // HX711
  scale.begin(DT, SCK);
  scale.set_scale(calibration_factor);
  scale.tare();

  if (scale.is_ready()) {
    Serial.println("HX711 Ready");
  } else {
    Serial.println("HX711 NOT detected!");
  }

  // GSM INIT
  initGSM();

  // GAS SENSOR WARMUP
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Gas Warmup");

  lcd.setCursor(0, 1);
  lcd.print("Please Wait");

  delay(60000);

  // WIFI
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected");

  delay(2000);
}

void loop() {

  // ================= IR SENSOR =================
  int irState = digitalRead(IR_SENSOR);

  // ================= GAS SENSOR =================
  int gasValue = 0;

  for (int i = 0; i < 20; i++) {
    gasValue += analogRead(GAS_SENSOR);
    delay(5);
  }

  gasValue /= 20;

  Serial.print("Gas Value: ");
  Serial.println(gasValue);

 // ================= WEIGHT =================
float weight   = 0;
float weightKg = 0;

// BASE VALUE
long baseValue = 230000;

if (scale.is_ready()) {

  // RAW VALUE
  long raw = scale.read();

  Serial.print("RAW: ");
  Serial.print(raw);

  // APPROXIMATE WEIGHT
  weightKg = (baseValue - raw) / 20000.0;

  // REMOVE NEGATIVE VALUES
  if (weightKg < 0) {
    weightKg = 0;
  }

  // REMOVE SMALL FLUCTUATIONS
  if (weightKg < 1) {
    weightKg = 0;
  }

  // LIMIT MAX VALUE
  if (weightKg > 10) {
    weightKg = 10;
  }

  // ROUND TO 1 DECIMAL
  weightKg = round(weightKg * 10.0) / 10.0;

  weight = weightKg;

  Serial.print("  Weight: ");
  Serial.print(weightKg, 1);
  Serial.println(" kg");

} else {

  Serial.println("HX711 not ready");
}

  // ================= ULTRASONIC =================
  long duration;
  float distance;

  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG, LOW);

  duration = pulseIn(ECHO, HIGH, 30000);

  if (duration == 0) {
    distance = 200;
  } else {
    distance = duration * 0.034 / 2;
  }

  Serial.print("Distance: ");
  Serial.println(distance);

  // ================= FILL LEVEL =================
  int fillLevel;

  if (irState == LOW) {
    fillLevel = 100;
  } else {
    fillLevel = 0;
  }

  Serial.print("Fill Level: ");
  Serial.println(fillLevel);

  // ================= SEND TO SERVER =================
  if (millis() - lastSendTime > 10000) {

    sendDataToServer(fillLevel, gasValue, weight, "none");

    lastSendTime = millis();
  }

  // Clear LCD line
  lcd.setCursor(0, 1);
  lcd.print("                ");

  // ================= GAS ALERT =================
  if (gasValue > gasThreshold && gasValue < 4090) {

    lcd.setCursor(0, 1);
    lcd.print("GAS ALERT!");

    myServo.write(0);

    if (!gasTimerStarted) {

      gasStartTime = millis();

      gasTimerStarted = true;

      sendSMS("WARNING! GAS DETECTED IN DUSTBIN", fillLevel, gasValue, weight);
    }

    // Call after 20 seconds
    if ((millis() - gasStartTime >= 20000) && !gasAlertSent) {

      makeCall();

      gasAlertSent = true;
    }

    delay(500);
    return;

  } else {

    gasAlertSent = false;
    gasTimerStarted = false;
  }

  // ================= WEIGHT OVERLOAD =================
  if (weight >= weightThreshold){
    lcd.setCursor(0, 1);
    lcd.print("OVERWEIGHT!");

    myServo.write(0);

    if (!isOverweight) {

      weightStartTime = millis();

      isOverweight = true;
    }

    if (!weightSmsSent) {

      sendSMS("WARNING! DUSTBIN OVERLOADED", fillLevel, gasValue, weight);

      weightSmsSent = true;
    }

    if ((millis() - weightStartTime >= 15000) && !weightCallMade) {

      makeCall();

      weightCallMade = true;
    }

    delay(500);
    return;

  } else {

    isOverweight = false;
    weightSmsSent = false;
    weightCallMade = false;
  }

  // ================= DUSTBIN FULL =================
  if (irState == LOW) {

    lcd.setCursor(0, 1);
    lcd.print("DUSTBIN FULL");

    myServo.write(0);

    if (!isFull) {

      fullStartTime = millis();

      isFull = true;
    }

    if (!smsSent) {

      sendSMS("DUSTBIN FULL", fillLevel, gasValue, weight);

      smsSent = true;
    }

    if ((millis() - fullStartTime >= 15000) && !callMade) {

      makeCall();

      callMade = true;
    }

  } else {

    isFull = false;
    smsSent = false;
    callMade = false;

    lcd.setCursor(0, 1);

    if (distance > 0 && distance < 20) {

      lcd.print("BIN OPEN");

      myServo.write(90);

    } else {

      lcd.print("BIN CLOSE");

      myServo.write(0);
    }
  }

  delay(500);
}

// ================= SEND DATA =================
void sendDataToServer(int fill, int gas, float weight, String smsStatus) {

  if (WiFi.status() == WL_CONNECTED) {

    WiFiClientSecure client;

    client.setInsecure();

    HTTPClient http;

    http.begin(client, serverURL);

    http.addHeader("Content-Type", "application/json");

    String json = "{";

    json += "\"bin_id\":\"BIN_001\",";
    json += "\"fill_level\":" + String(fill) + ",";
    json += "\"gas_level\":" + String(gas) + ",";
    json += "\"weight\":" + String(weight, 1) + ",";
    json += "\"smsStatus\":\"" + smsStatus + "\"";

    json += "}";

    int httpResponseCode = http.POST(json);

    Serial.print("HTTP Response: ");
    Serial.println(httpResponseCode);

    http.end();
  }
}

// ================= GSM INIT =================
void initGSM() {

  Serial.println("Initializing GSM...");

  Serial2.println("AT");
  delay(1000);

  Serial2.println("ATE0");
  delay(1000);

  Serial2.println("AT+CMGF=1");
  delay(1000);

  Serial2.println("AT+CSCS=\"GSM\"");
  delay(1000);

  Serial2.println("AT+CSQ");
  delay(1000);

  Serial2.println("AT+CREG?");
  delay(1000);

  while (Serial2.available()) {
    Serial.write(Serial2.read());
  }

  Serial.println("GSM Ready");
}

// ================= SEND SMS =================
void sendSMS(String msg, int fill, int gas, float weight) {

  Serial.println("Sending SMS...");

  Serial2.println("AT+CMGF=1");
  delay(1000);

  Serial2.println("AT+CSCS=\"GSM\"");
  delay(1000);

  Serial2.print("AT+CMGS=\"+919080865052\"\r");

  delay(3000);

  Serial2.print(msg);

  delay(500);

  Serial2.write(26);

  delay(7000);

  while (Serial2.available()) {
    Serial.write(Serial2.read());
  }

  Serial.println("SMS SENT");

  // SEND SMS STATUS TO SERVER
  sendDataToServer(fill, gas, weight, "sent");
}

// ================= MAKE CALL =================
void makeCall() {

  Serial.println("Calling...");

  Serial2.println("ATD+919080865052;");

  delay(15000);

  Serial2.println("ATH");
}
