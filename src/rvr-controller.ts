import { RobotControllerBase, IPortInformation, DigitalPinMode, PinMode, PinModeToFirmataPinMode } from "@bbfrc/drivethru";
import { SpheroRVR, LED, SerialTransport, RawMotorModes } from "sphero-rvr-base";

interface IAccelerometerData {
    X: number;
    Y: number;
    Z: number;
}

interface IColorDetectionData {
    R: number;
    G: number;
    B: number;
    Index: number;
    Confidence: number;
}

function servoAngleToMotorValue(angle: number): number {
    if (angle < 0) {
        angle = 0;
    }
    if (angle > 180) {
        angle = 180;
    }

    if (angle === 90) {
        return 0;
    }

    return Math.floor(((angle / 180) * 510) - 255);
}

function constrain(input: number, low: number, high: number): number {
    if (input < low) {
        return low;
    }
    if (input > high) {
        return high;
    }
    return input;
}

function mapValue(input: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number): number {
    return ((input - fromLow) * (toHigh - toLow) / (fromHigh - fromLow)) + toLow;
}

export class RvrRobotController extends RobotControllerBase {
    private _rvr: SpheroRVR;
    private _digitalPortToLedMap: Map<number, LED>;

    private _digitalPins: IPortInformation[] = [];
    private _analogPins: IPortInformation[] = [];
    private _servoPins: IPortInformation[] = [];

    private _analogInValues: number[] = [];

    private _digitalReadCallbacks: {[channel: number]: (port: number, value: boolean) => void } = {};
    private _analogReadCallbacks: {[channel: number]: (port: number, value: number) => void} = {};


    // TODO this should be configurable, maybe via JSON file?
    private readonly _numDigitalPins: number = 6;
    private readonly _numAnalogPins: number = 7;
    private readonly _numServoPins: number = 2;

    private _leftSpeed: number = 0;
    private _rightSpeed: number = 0;

    constructor(serialPort: string) {
        super();

        const serialTransport: SerialTransport = new SerialTransport(serialPort, (err) => {
            if (err) {
                console.log("Error while opening serial port: ", err.message);
                process.exit(1);
            }

            this.emit("ready");
        });

        this._rvr = new SpheroRVR(serialTransport);

        this.setupDigitalPins();
        this.setupServoPins();
        this.setupAnalogPins();


        // Set firmware information
        this._firmwareName = "drivethru-rvr";
        this._firmwareVersionMajor = 1;
        this._firmwareVersionMinor = 0;

        this._rvr.wake();
        this._rvr.getBatteryPercentage()
            .then(battPct => {
                console.log("RVR Battery Percentage: " + battPct);
            });
        this._rvr.setAllLeds(0, 0, 0);
    }

    private setupDigitalPins(): void {
        const hwPinStart = 0;
        this._digitalPortToLedMap = new Map<number, LED>();
        this._digitalPortToLedMap.set(0, LED.LEFT_HEADLIGHT);
        this._digitalPortToLedMap.set(1, LED.RIGHT_HEADLIGHT);
        this._digitalPortToLedMap.set(2, LED.LEFT_BRAKELIGHT);
        this._digitalPortToLedMap.set(3, LED.RIGHT_BRAKELIGHT);
        this._digitalPortToLedMap.set(4, LED.LEFT_STATUS);
        this._digitalPortToLedMap.set(5, LED.RIGHT_STATUS);
        // this._digitalPortToLedMap.set(6, LED.BATTERY_DOOR_FRONT);
        // this._digitalPortToLedMap.set(7, LED.BATTERY_DOOR_REAR);
        // this._digitalPortToLedMap.set(8, LED.POWER_BUTTON_FRONT);
        // this._digitalPortToLedMap.set(9, LED.POWER_BUTTON_REAR);

        for (let i = 0; i < 6; i++) {
            this._digitalPins.push({
                hwPin: hwPinStart + i,
                mode: PinModeToFirmataPinMode(PinMode.OUTPUT),
                supportedModes: [PinModeToFirmataPinMode(PinMode.OUTPUT)],
                value: false
            });
        }
    }

    private setupServoPins(): void {
        const hwPinStart = this._numDigitalPins + this._numAnalogPins;

        for (let i = 0; i < this._numServoPins; i++) {
            this._servoPins.push({
                hwPin: hwPinStart + i,
                mode: PinModeToFirmataPinMode(PinMode.SERVO),
                supportedModes: [PinModeToFirmataPinMode(PinMode.SERVO)],
                value: 90
            });
        }
    }

    private setupAnalogPins(): void {
        // TODO configure the pins accordingly
        const hwPinStart = this._numDigitalPins;
        // 7 pins total. 0-2 are for X,Y,Z accelerometer
        // 3-6 are for R,G,B and valid. if Index = 255, then valid = 0, otherwise, it is the confidence level

        for (let i = 0; i <this._numAnalogPins; i++) {
            this._analogInValues[i] = 0;
        }

        for (let i = 0; i < this._numAnalogPins; i++) {
            this._analogPins.push({
                hwPin: hwPinStart + i,
                mode: PinModeToFirmataPinMode(PinMode.ANALOG),
                supportedModes: [PinModeToFirmataPinMode(PinMode.SERVO)],
                value: 0
            });
        }

        // TODO This configuration of sensor services should be done programatically
        this._rvr.enableSensor("Accelerometer", (sensorData: IAccelerometerData) => {
            const x = constrain(mapValue(sensorData.X, -16.0, 16.0, 0, 1023), 0, 1023);
            const y = constrain(mapValue(sensorData.Y, -16.0, 16.0, 0, 1023), 0, 1023);
            const z = constrain(mapValue(sensorData.Z, -16.0, 16.0, 0, 1023), 0, 1023);

            this._analogPins[0].value = x;
            this._analogPins[1].value = y;
            this._analogPins[2].value = z;

            this.handleAnalogReadCallback(0, x);
            this.handleAnalogReadCallback(1, y);
            this.handleAnalogReadCallback(2, z);

            // { X, Y, Z all double, [-16.0, 16.0]}
            // console.log("accel: ", sensorData);

        });

        this._rvr.enableColorDetection(true);
        this._rvr.enableSensor("ColorDetection", (sensorData: IColorDetectionData) => {
            if (sensorData.Index === 255) {
                this._analogPins[3].value = 0;
                this._analogPins[4].value = 0;
                this._analogPins[5].value = 0;
                this._analogPins[6].value = 0;

                this.handleAnalogReadCallback(3, 0);
                this.handleAnalogReadCallback(4, 0);
                this.handleAnalogReadCallback(5, 0);
                this.handleAnalogReadCallback(6, 0);
                return;
            }

            const r = constrain(mapValue(sensorData.R, 0, 255, 0, 1023), 0, 1023);
            const g = constrain(mapValue(sensorData.G, 0, 255, 0, 1023), 0, 1023);
            const b = constrain(mapValue(sensorData.B, 0, 255, 0, 1023), 0, 1023);
            const confidence = constrain(mapValue(sensorData.Confidence, 0.0, 1.0, 0, 1023), 0, 1023);

            this._analogPins[3].value = r;
            this._analogPins[4].value = g;
            this._analogPins[5].value = b;
            this._analogPins[6].value = confidence;

            this.handleAnalogReadCallback(3, r);
            this.handleAnalogReadCallback(4, g);
            this.handleAnalogReadCallback(5, b);
            this.handleAnalogReadCallback(6, confidence);
            // { R: 0-255, G: 0-255, B: 0-255, Index: int (255 if no color), Confidence: [0,1]}
            // console.log("color: ", sensorData);
        });

        this._rvr.startSensorStreaming([], 100);



    }

    public get totalPhysicalPins(): number {
        return this._numDigitalPins + this._numAnalogPins + this._numServoPins;
    }

    public get digitalPins(): IPortInformation[] {
        return this._digitalPins;
    }

    public get analogPins(): IPortInformation[] {
        return this._analogPins;
    }

    public get servoPins(): IPortInformation[] {
        return this._servoPins
    }

    public reset(): void {
        // Turn the LEDs off
        this._rvr.setAllLeds(0, 0, 0);

        // Turn the motors off
        this._rvr.setRawMotors(RawMotorModes.OFF, 0, RawMotorModes.OFF, 0);
        this._leftSpeed = 0;
        this._rightSpeed = 0;
    }

    public setDigitalPinMode(port: number, mode: DigitalPinMode): void {
        // no-op
    }

    public getDigitalValue(port: number): boolean {
        return false;
    }

    public setDigitalValue(port: number, value: boolean): void {
        if (this._digitalPortToLedMap.has(port)) {
            const ledIdx: LED = this._digitalPortToLedMap.get(port);

            let redValue: number = 0;
            if (value) {
                redValue = 255;
            }

            this._rvr.setSingleLed(ledIdx, redValue, 0, 0);
        }
    }

    public setServoValue(port: number, value: number): void {
        const motorValue = servoAngleToMotorValue(value);

        // convert 0-180 to -255-255
        if (port === 0) {
            this._leftSpeed = motorValue;
        }
        else if (port === 1) {
            this._rightSpeed = motorValue;
        }

        this.setMotors();
    }

    private setMotors() {
        let leftMode: RawMotorModes = RawMotorModes.OFF;
        let rightMode: RawMotorModes = RawMotorModes.OFF;

        let leftSpeed: number = 0;
        let rightSpeed: number = 0;

        if (this._leftSpeed < 0) {
            leftSpeed = Math.abs(this._leftSpeed);
            leftMode = RawMotorModes.REVERSE;
        }
        else if (this._leftSpeed > 0) {
            leftSpeed = this._leftSpeed;
            leftMode = RawMotorModes.FORWARD;
        }

        if (this._rightSpeed < 0) {
            rightSpeed = Math.abs(this._rightSpeed);
            rightMode = RawMotorModes.REVERSE;
        }
        else if (this._rightSpeed > 0) {
            rightSpeed = this._rightSpeed;
            rightMode = RawMotorModes.FORWARD;
        }

        this._rvr.setRawMotors(leftMode, leftSpeed, rightMode, rightSpeed);
    }

    public getAnalogValue(port: number): number {
        if (!this._analogPins[port]) {
            return 0;
        }
        return this._analogPins[port].value as number;
    }

    public subscribeToAnalogValue(port: number, value: boolean): void {
        if (!this._analogPins[port]) {
            return;
        }

        if (!this._isReady) {
            return;
        }

        if (this._analogReadCallbacks[port] === undefined) {
            const cb = this.handleAnalogReadCallback.bind(this, port);
            this._analogReadCallbacks[port] = cb;
        }
    }

    private handleAnalogReadCallback(port: number, value: number): void {
        if (!this._analogPins[port]) {
            return;
        }

        this._analogPins[port].value = value;

        // Also emit an event
        this.emit("analogRead", {
            port,
            value
        });
    }

    public subscribeToDigitalValue(port: number, value: boolean): void {
        // no-op
    }


}
