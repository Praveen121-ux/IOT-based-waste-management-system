#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h"
#include <Servo.h>
#include <SoftwareSerial.h>

#define DT 3
#define SCK 2
#define TRIG 9
#define ECHO 8
#define SERVO_PIN 6
#define IR_SENSOR 7

SoftwareSerial sim800(10,11);

HX711 scale;
LiquidCrystal_I2C lcd(0x27,16,2);
Servo myServo;

float calibration_factor = -7050;

bool fullSmsSent=false;
bool overloadSmsSent=false;

void setup(){

  Serial.begin(9600);
  sim800.begin(9600);

  lcd.init();
  lcd.backlight();

  scale.begin(DT,SCK);
  scale.set_scale(calibration_factor);
  scale.tare();

  pinMode(TRIG,OUTPUT);
  pinMode(ECHO,INPUT);
  pinMode(IR_SENSOR,INPUT);

  myServo.attach(SERVO_PIN);
  myServo.write(0);

  lcd.setCursor(0,0);
  lcd.print("SMART DUSTBIN");

  delay(5000);
}

void loop(){

  float weight = scale.get_units(5);
  int irState = digitalRead(IR_SENSOR);

  long duration;
  float distance;

  digitalWrite(TRIG,LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG,HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG,LOW);

  duration = pulseIn(ECHO,HIGH);
  distance = duration * 0.034 / 2;

  lcd.setCursor(0,0);
  lcd.print("SMART DUSTBIN  ");

  lcd.setCursor(0,1);

  // BIN FULL
  if(irState==LOW){

    lcd.print("DUSTBIN FULL ");
    myServo.write(0);

    if(!fullSmsSent){
      sendSMS("Alert: Dustbin FULL");
      fullSmsSent=true;
    }
  }

  // OVERLOAD
  else if(weight>10.0){

    lcd.print("OVERLOADED   ");
    myServo.write(0);

    if(!overloadSmsSent){
      sendSMS("Alert: Dustbin OVERLOADED");
      overloadSmsSent=true;
    }
  }

  else{

    fullSmsSent=false;
    overloadSmsSent=false;

    if(distance>0 && distance<15){
      lcd.print("DOOR OPEN    ");
      myServo.write(90);
    }
    else{
      lcd.print("DOOR CLOSE   ");
      myServo.write(0);
    }
  }

  // Weight on right side
  lcd.setCursor(10,1);
  lcd.print("WT:");
  lcd.print(weight,1);
  lcd.print(" ");

  delay(500);
}

void sendSMS(String message){

  sim800.println("AT");
  delay(1000);

  sim800.println("AT+CMGF=1");
  delay(1000);

  sim800.println("AT+CMGS=\"+919080865052\"");
  delay(1000);

  sim800.print(message);
  delay(500);

  sim800.write(26);
  delay(5000);
}
