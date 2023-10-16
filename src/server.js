import http from "http";
import SocketIO from "socket.io";
import express from "express";

const app = express();

app.set("view engine", "pug");
app.set("views", __dirname + "/views");
app.use("/public", express.static(__dirname + "/public"));
app.get("/", (_, res) => res.render("home"));
app.get("/*", (_, res) => res.redirect("/"));

const httpServer = http.createServer(app);
const wsServer = SocketIO(httpServer);

// Put all your backend code here.
function getRoomCount(roomName) {
	return wsServer.sockets.adapter.rooms.get(roomName)?.size;
}

wsServer.on("connection", (socket) => {
	socket.on("join", (room, done) => {
		socket.join(room);
		const userCount = getRoomCount(room);
		if (userCount == 1) socket["nickname"] = "A";
		else if (userCount == 2) socket["nickname"] = "B";
		else socket["nickname"] = "C";
		if (userCount <= 2) {
			// socket.to(room).emit("welcome", socket.nickname, userCount);
			socket.emit("welcome", room, socket.nickname, userCount);
			done(room, socket.nickname);
		} else {
			socket.emit("welcome", room, socket.nickname, userCount);
		}
	});

	socket.on("offer", (offer, room) => {
		socket.to(room).emit("offer", offer);
	});
	socket.on("answer", (answer, room) => {
		socket.to(room).emit("answer", answer);
	});
	socket.on("ice", (ice, room) => {
		socket.to(room).emit("ice", ice);
	});

	socket.on("disconnecting", () => {
		socket.rooms.forEach((room) =>
			socket.to(room).emit("bye", socket.nickname)
		);
	});
	socket.on("disconnect", () => {
		console.log("disconnected!");
	});
});

const handleListen = () => console.log(`Listening on http://localhost:3000`);
httpServer.listen(3000, handleListen);
