#!/usr/bin/env node
import { DrivethruServer } from "@bbfrc/drivethru";
import { RvrRobotController } from "./rvr-controller";

import program from "commander";

program
    .description("Drivethru Compatible RVR Robot")
    .name("drivethru-rvr")
    .option("-s, --serial-port <port>", "Serial port identifier");

program.parse(process.argv);

const serialPort: string = program.serialPort || "";

if (serialPort === "") {
    console.log("Serial port must be provided");
    program.outputHelp();
    process.exit(1);
}

const controller = new RvrRobotController(serialPort);
const server = new DrivethruServer(controller, { port: 9001 });

server.startP()
.then(() => {
    console.log("Server up");
});
