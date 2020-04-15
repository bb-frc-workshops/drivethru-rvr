import { RobotControllerBase, IPortInformation, DigitalPinMode, PinMode, PinModeToFirmataPinMode } from "@bbfrc/drivethru";
import { SpheroRVR, LED, SerialTransport, RawMotorModes } from "sphero-rvr-base";

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

export class RvrRobotController extends RobotControllerBase {
    private _rvr: SpheroRVR;
    private _digitalPortToLedMap: Map<number, LED>;

    private _digitalPins: IPortInformation[] = [];
    private _analogPins: IPortInformation[] = [];
    private _servoPins: IPortInformation[] = [];

    private readonly _numDigitalPins: number = 6;
    private readonly _numAnalogPins: number = 0;
    private readonly _numServoPins: number = 2;

    private _leftSpeed: number = 0;
    private _rightSpeed: number = 0;

    constructor(serialPort: string) {
        super();

        const serialTransport: SerialTransport = new SerialTransport(serialPort, () => {
            this.emit("ready");
        });
        this._rvr = new SpheroRVR(serialTransport);

        this.setupDigitalPins();
        this.setupServoPins();

        this._rvr.wake();
        this._rvr.getBatteryPercentage()
            .then(battPct => {
                console.log("RVR Battery Percentage: " + battPct);
            });
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
        return 0;
    }

    public subscribeToAnalogValue(port: number): void {
        // no-op
    }

    public subscribeToDigitalValue(port: number): void {
        // no-op
    }


}
