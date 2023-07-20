var constraints = {
    video: {
        width: { max: 320 },
        height: { max: 240 },
        frameRate: { max: 30 },
    },
    audio: false,
};

function generateClientId() {
    return Math.random().toString(36).substring(2, 9);
}

function errorHandler(error) {
    console.error(error);
}

const peerConnections = {};

function start() {
    localUuid = generateClientId();

    localDisplayName = prompt("Enter your name", "");
    document
        .getElementById("localVideoContainer")
        .appendChild(makeLabel(localDisplayName));

    // set up local video stream
    if (navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
            .getUserMedia(constraints)
            .then((stream) => {
                localStream = stream;
                document.getElementById("localVideo").srcObject = stream;
            })
            .catch(errorHandler)

            // set up websocket and message all existing clients
            .then(() => {
                serverConnection = new WebSocket("ws://localhost:8080");
                serverConnection.onmessage = gotMessageFromServer;
                serverConnection.onopen = (event) => {
                    serverConnection.send(
                        JSON.stringify({
                            displayName: localDisplayName,
                            uuid: localUuid,
                            dest: "all",
                        })
                    );
                };
            })
            .catch(errorHandler);
    } else {
        alert("Your browser does not support getUserMedia API");
    }
}

function gotMessageFromServer(message) {
    var signal = JSON.parse(message.data);
    var peerUuid = signal.uuid;

    // Ignore messages that are not for us or from ourselves
    if (
        peerUuid == localUuid ||
        (signal.dest != localUuid && signal.dest != "all")
    )
        return;

    if (signal.displayName && signal.dest == "all") {
        console.log("1");
        // set up peer connection object for a newcomer peer
        setUpPeer(peerUuid, signal.displayName);
        serverConnection.send(
            JSON.stringify({
                displayName: localDisplayName,
                uuid: localUuid,
                dest: peerUuid,
            })
        );
    } else if (signal.displayName && signal.dest == localUuid) {
        console.log("2");
        // initiate call if we are the newcomer peer
        setUpPeer(peerUuid, signal.displayName, true);
    } else if (signal.sdp) {
        console.log("3");
        peerConnections[peerUuid].pc
            .setRemoteDescription(new RTCSessionDescription(signal.sdp))
            .then(function () {
                // Only create answers in response to offers
                if (signal.sdp.type == "offer") {
                    peerConnections[peerUuid].pc
                        .createAnswer()
                        .then((description) =>
                            createdDescription(description, peerUuid)
                        )
                        .catch(errorHandler);
                }
            })
            .catch(errorHandler);
    } else if (signal.ice) {
        peerConnections[peerUuid].pc
            .addIceCandidate(new RTCIceCandidate(signal.ice))
            .catch(errorHandler);
    }
}

function setUpPeer(peerUuid, displayName, initCall = false) {
    peerConnections[peerUuid] = {
        displayName: displayName,
        pc: new RTCPeerConnection(),
    };
    peerConnections[peerUuid].pc.onicecandidate = (event) =>
        gotIceCandidate(event, peerUuid);
    peerConnections[peerUuid].pc.ontrack = (event) =>
        gotRemoteStream(event, peerUuid);
    peerConnections[peerUuid].pc.oniceconnectionstatechange = (event) =>
        checkPeerDisconnect(event, peerUuid);
    peerConnections[peerUuid].pc.addStream(localStream);

    if (initCall) {
        peerConnections[peerUuid].pc
            .createOffer()
            .then((description) => createdDescription(description, peerUuid))
            .catch(errorHandler);
    }
}

function createdDescription(description, peerUuid) {
    console.log(`Created ${description.type} description, peer ${peerUuid}`);
    peerConnections[peerUuid].pc
        .setLocalDescription(description)
        .then(() => {
            serverConnection.send(
                JSON.stringify({
                    sdp: peerConnections[peerUuid].pc.localDescription,
                    uuid: localUuid,
                    dest: peerUuid,
                })
            );
        })
        .catch(errorHandler);
}

function gotIceCandidate(event, peerUuid) {
    if (event.candidate != null) {
        console.log(`Local ICE candidate: \n${event.candidate.candidate}`);

        serverConnection.send(
            JSON.stringify({
                ice: event.candidate,
                uuid: localUuid,
                dest: peerUuid,
            })
        );
    }
}

function gotRemoteStream(event, peerUuid) {
    console.log(`got remote stream, peer ${peerUuid}`);
    // assign stream to new HTML video element
    var vidElement = document.createElement("video");
    vidElement.setAttribute("autoplay", "");
    vidElement.setAttribute("muted", "");
    vidElement.srcObject = event.streams[0];

    var vidContainer = document.createElement("div");
    vidContainer.setAttribute("id", "remoteVideo_" + peerUuid);
    vidContainer.setAttribute("class", "videoContainer");
    vidContainer.appendChild(vidElement);
    vidContainer.appendChild(makeLabel(peerConnections[peerUuid].displayName));

    document.getElementById("videos").appendChild(vidContainer);

    updateLayout();
}

function checkPeerDisconnect(event, peerUuid) {
    var state = peerConnections[peerUuid].pc.iceConnectionState;
    console.log(`connection with peer ${peerUuid} ${state}`);
    if (state === "failed" || state === "closed" || state === "disconnected") {
        delete peerConnections[peerUuid];
        document
            .getElementById("videos")
            .removeChild(document.getElementById("remoteVideo_" + peerUuid));
        updateLayout();
    }
}

function updateLayout() {
    // update CSS grid based on number of displayed videos
    var rowHeight = "98vh";
    var colWidth = "98vw";

    var numVideos = Object.keys(peerConnections).length + 1; // add one to include local video

    if (numVideos > 1 && numVideos <= 4) {
        // 2x2 grid
        rowHeight = "48vh";
        colWidth = "48vw";
    } else if (numVideos > 4) {
        // 3x3 grid
        rowHeight = "32vh";
        colWidth = "32vw";
    }

    document.documentElement.style.setProperty(`--rowHeight`, rowHeight);
    document.documentElement.style.setProperty(`--colWidth`, colWidth);
}

function makeLabel(label) {
    var vidLabel = document.createElement("div");
    vidLabel.appendChild(document.createTextNode(label));
    vidLabel.setAttribute("class", "videoLabel");
    return vidLabel;
}
