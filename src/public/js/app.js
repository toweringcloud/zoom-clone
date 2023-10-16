const socket = io();

const call = document.querySelector("#call");
const myFace = document.querySelector("#myFace");
const muteBtn = document.querySelector("#mute");
const cameraBtn = document.querySelector("#camera");
const cameraSelect = document.querySelector("#cameras");

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myPeerConnection;
let myDataChannel;
let myName;
let peerName;

document.body.style.backgroundColor = "skyblue";
cameraSelect.hidden = true;
call.hidden = true;

// Viceo Call Flow
//-1) send offer : getUserMedia() -> addStream() -> createOffer() -> setLocalDescription()
//-2) receive answer : setRemoteDescription()
//-3) send candidate : icecandidate event fired
//-4) receive candidate : addICECandidate()
//-5) exchange stream : addstream event fired

async function getCameras() {
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const cameras = devices.filter(
			(device) => device.kind === "videoinput"
		);
		// console.log(`${cameras.length} | ${JSON.stringify(cameras[0])}`);
		// {"deviceId":"b84f4524addca9b8b7131f056166401fa759e5b11966d0ae5b49c91a8f355051","kind":"videoinput","label":"LG Camera (0bda:5641)","groupId":"057bb50787679d12ed1f84628befd925a7719eff1ef760f52ad41e79a5270700"}
		const currentCamera = myStream.getVideoTracks()[0];

		cameras.forEach((camera) => {
			const option = document.createElement("option");
			option.value = camera.deviceId;
			option.innerText = camera.label;
			if (currentCamera.label === camera.label) {
				option.selected = true;
			}
			cameraSelect.appendChild(option);
		});
		return cameras;
	} catch (e) {
		console.log(e);
	}
}

async function getMedia(deviceId) {
	const initialConstrains = {
		audio: true,
		video: { facingMode: "user" },
	};
	const cameraConstrains = {
		audio: true,
		video: { deviceId: { exact: deviceId } },
	};

	try {
		myStream = await navigator.mediaDevices.getUserMedia(
			deviceId ? cameraConstrains : initialConstrains
		);
		myFace.srcObject = myStream;
		if (!deviceId) await getCameras();
	} catch (e) {
		console.log(e);
	}
}

function handleMuteClick() {
	myStream
		.getAudioTracks()
		.forEach((track) => (track.enabled = !track.enabled));

	if (!muted) {
		muteBtn.innerText = "Unmute";
		muted = true;
	} else {
		muteBtn.innerText = "Mute";
		muted = false;
	}
}

function handleCameraClick() {
	myStream
		.getVideoTracks()
		.forEach((track) => (track.enabled = !track.enabled));

	if (cameraOff) {
		cameraBtn.innerText = "Turn Camera Off";
		cameraOff = false;
	} else {
		cameraBtn.innerText = "Turn Camera On";
		cameraOff = true;
	}
}

async function handleCameraChange() {
	await getMedia(cameraSelect.value);

	if (myPeerConnection) {
		const currentVideoTrack = myStream.getVideoTrack()[0];
		const videoSender = myPeerConnection
			.getSenders()
			.find((sender) => sender.track.kind === "video");
		videoSender.replaceTrack(currentVideoTrack);

		const currentAudioTrack = myStream.getAudioTrack()[0];
		const audioSender = myPeerConnection
			.getSenders()
			.find((sender) => sender.track.kind === "audio");
		audioSender.replaceTrack(currentAudioTrack);
	}
}

async function startMedia() {
	call.hidden = false;
	await getMedia();
	makeConnection();
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
cameraSelect.addEventListener("input", handleCameraChange);

// Welcome Form
const lobby = document.querySelector("#lobby");
const lobbyForm = lobby.querySelector("form");
const room = document.querySelector("#room");
const chatForm = document.querySelector("#chat");
const msg = chatForm.querySelector("input");

chatForm.hidden = true;

function addMessage(msg) {
	const ul = room.querySelector("ul");
	const li = document.createElement("li");
	li.innerText = msg;
	ul.append(li);
}

function showRoom(room, user) {
	lobby.hidden = true;
	chatForm.hidden = false;
	roomName = room;
	myName = user;
}

async function handleJoinSubmit(event) {
	event.preventDefault();
	const input = lobbyForm.querySelector("input");
	const roomName = input.value;
	const h3 = room.querySelector("h3");
	h3.innerText = `[Room] ${roomName}, [User] A`;
	await startMedia();
	socket.emit("join", roomName, showRoom);
	input.value = "";
}
lobbyForm.addEventListener("submit", handleJoinSubmit);

function handleChatSubmit(event) {
	event.preventDefault();
	const input = chatForm.querySelector("input");
	const message = input.value;
	myDataChannel.send(message);
	addMessage(`User ${myName} sent direct message : ${message}`);
	input.value = "";
}
chatForm.addEventListener("submit", handleChatSubmit);

// Socket Code
socket.on("welcome", async (roomName, nickName, userCount) => {
	if (userCount > 2) {
		myStream = null;
		room.hidden = true;
		alert("2 people max. allowed per room!");
		return;
	}
	const h3 = room.querySelector("h3");
	h3.innerText = `[Room] ${roomName}, [User] ${nickName}`;

	myDataChannel = myPeerConnection.createDataChannel("chat");
	myDataChannel.addEventListener("message", (event) => {
		addMessage(`User ${myName} received direct message : ${event.data}`);
	});
	console.log("made data channel");

	const offer = await myPeerConnection.createOffer();
	myPeerConnection.setLocalDescription(offer);
	socket.emit("offer", offer, roomName);
	console.log("sent the offer: " + offer);
	// console.log(offer);
});

socket.on("bye", (user) => {
	addMessage(`User ${user} left!`);
});

socket.on("offer", async (offer) => {
	myPeerConnection.addEventListener("datachannel", (event) => {
		myDataChannel = event.channel;
		myDataChannel.addEventListener("message", (event) => {
			addMessage(
				`User ${myName} received direct message : ${event.data}`
			);
		});
	});
	myPeerConnection.setRemoteDescription(offer);
	console.log("received the offer: " + offer);
	const answer = await myPeerConnection.createAnswer();
	myPeerConnection.setLocalDescription(answer);
	socket.emit("answer", answer, roomName);
	console.log("sent the answer: " + answer);
});

socket.on("answer", (answer) => {
	myPeerConnection.setRemoteDescription(answer);
	console.log("received the answer: " + answer);
	// console.log(answer);
});

socket.on("ice", (ice) => {
	myPeerConnection.addIceCandidate(ice);
	console.log("received the candidate: " + ice);
	// console.log(ice);
});

// RTC Code
function handleIce(data) {
	socket.emit("ice", data.candidate, roomName);
	console.log("sent the candidate: " + data.candidate);
}

function handleAddStream(data) {
	console.log("got a stream from my peer");
	console.log("[Peer's Stream] ", data.stream);
	console.log("[My Stream] ", myStream);
	const peerFace = document.querySelector("#peerFace");
	peerFace.srcObject = data.stream;
}

function makeConnection() {
	myPeerConnection = new RTCPeerConnection({
		iceServers: [
			{
				urls: [
					"stun:stun.l.google.com:19302",
					"stun:stun1.l.google.com:19302",
					"stun:stun2.l.google.com:19302",
					"stun:stun3.l.google.com:19302",
					"stun:stun4.l.google.com:19302",
				],
			},
		],
	});
	myPeerConnection.addEventListener("icecandidate", handleIce);
	myPeerConnection.addEventListener("addstream", handleAddStream);

	myStream.getTracks().forEach((track) => {
		// console.log(track);
		myPeerConnection.addTrack(track, myStream);
	});
}
