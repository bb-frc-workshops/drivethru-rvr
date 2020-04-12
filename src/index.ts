import { DrivethruServer } from "@bbfrc/drivethru";
import { RvrRobotController } from "./rvr-controller";

const controller = new RvrRobotController("COM3");
const server = new DrivethruServer(controller, { port: 9001 });

server.startP()
.then(() => {
    console.log("Server up");
});
