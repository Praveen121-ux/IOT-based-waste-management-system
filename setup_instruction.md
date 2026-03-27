# Setup Instructions

Step 1: Install Software
- Install Arduino IDE
- Install required board packages (if using NodeMCU)

---

Step 2: Install Libraries in Arduino IDE
Go to: Sketch → Include Library → Manage Libraries

Install:
- HX711
- Servo
- LiquidCrystal_I2C
- SoftwareSerial

---
Step 3: Hardware Connections

### Ultrasonic Sensor (HC-SR04)
- VCC → 5V
- GND → GND
- TRIG → Digital Pin 7
- ECHO → Digital Pin 6

### Load Cell + HX711
- DT → Pin 3
- SCK → Pin 2

### MQ Gas Sensor
- A0 → Analog Pin A0

### Servo Motor
- Signal → Pin 9

### GSM Module
- TX → Arduino RX
- RX → Arduino TX

### LCD (I2C)
- SDA → A4
- SCL → A5

---

 Step 4: Power Supply
- Use 9V adapter or battery
- Ensure stable power for GSM module

---

 Step 5: Upload Code
1. Connect Arduino via USB
2. Open Arduino IDE
3. Select Board: Arduino Uno
4. Select correct COM Port
5. Click Upload

---

Step 6: GSM Setup
- Insert SIM card into GSM module
- Ensure network signal
- Update phone number in code

---

 Step 7: Testing
- Place waste → check fill detection
- Add weight → verify load cell
- Release gas → test MQ sensor
- Check SMS alert functionality

---

 Troubleshooting

### Problem: GSM not sending SMS
- Check SIM balance
- Verify wiring
- Ensure proper power supply

### Problem: Wrong sensor values
- Recalibrate load cell
- Check connections

---

 Result
System will:
- Monitor waste in real-time
- Send alerts when full or hazardous
- Improve waste collection efficiency
