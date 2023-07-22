// Configuration for media constraints (video and audio)
const constraints = {
    video: {
        width: { ideal: 240 },
        height: { ideal: 200 },
        frameRate: { ideal: 30 },
    },
    audio: false,
};

// Variables for storing local data and connection information
let localUuid;
let localDisplayName;
let localStream;
let serverConnection;
const peerConnections = {};

// Function to generate a random client ID (used for UUID)
function generateClientId() {
    return Math.random().toString(36).substring(2, 9);
}

// Error handling function to log errors (custom error handling can be added)
function errorHandler(error) {
    console.error(error);
}

// Get user media stream (video and audio) from the user's device
async function getUserMediaStream(constraints) {
    try {
        return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
        errorHandler("Error accessing media devices: " + error.message);
        throw error;
    }
}

// Send message to the server
function sendMessageToServer(message) {
    serverConnection.send(JSON.stringify(message));
}

// Handle incoming messages from the server
async function handleServerMessage(message) {
    const signal = JSON.parse(message.data);
    const peerUuid = signal.uuid;

    // Ignore messages that are not for us or from ourselves
    if (
        peerUuid === localUuid ||
        (signal.dest !== localUuid && signal.dest !== "all")
    )
        return;

    if (signal.displayName && signal.dest === "all") {
        // Set up peer connection object for a newcomer peer
        await setUpPeer(peerUuid, signal.displayName);
        sendMessageToServer({
            displayName: localDisplayName,
            uuid: localUuid,
            dest: peerUuid,
        });
    } else if (signal.displayName && signal.dest === localUuid) {
        // Initiate call if we are the newcomer peer
        await setUpPeer(peerUuid, signal.displayName, true);
    } else if (signal.sdp) {
        try {
            // Set the remote description for the peer connection
            await peerConnections[peerUuid].pc.setRemoteDescription(
                new RTCSessionDescription(signal.sdp)
            );

            // Only create answers in response to offers
            if (signal.sdp.type === "offer") {
                // Create an answer description for the remote peer
                const description = await peerConnections[
                    peerUuid
                ].pc.createAnswer();
                // Send the answer to the remote peer
                await createdDescription(description, peerUuid);
            }
        } catch (error) {
            errorHandler(error);
        }
    } else if (signal.ice) {
        try {
            // Add the ICE candidate received from the remote peer
            await peerConnections[peerUuid].pc.addIceCandidate(
                new RTCIceCandidate(signal.ice)
            );
        } catch (error) {
            errorHandler(error);
        }
    }
}

// Set up a new peer connection and add event listeners
async function setUpPeer(peerUuid, displayName, initCall = false) {
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

    // Add the local media stream to the peer connection
    if (localStream) {
        localStream.getTracks().forEach((track) => {
            peerConnections[peerUuid].pc.addTrack(track, localStream);
        });
    }

    if (initCall) {
        // If this is a new peer, create an offer description and send it to the remote peer
        try {
            const description = await peerConnections[
                peerUuid
            ].pc.createOffer();
            await createdDescription(description, peerUuid);
        } catch (error) {
            errorHandler(error);
        }
    }
}

// Handle the created description (SDP) for a peer connection
async function createdDescription(description, peerUuid) {
    console.log(`Created ${description.type} description, peer ${peerUuid}`);
    try {
        await peerConnections[peerUuid].pc.setLocalDescription(description);
        sendMessageToServer({
            sdp: peerConnections[peerUuid].pc.localDescription,
            uuid: localUuid,
            dest: peerUuid,
        });
    } catch (error) {
        errorHandler(error);
    }
}

// Handle ICE candidates and send them to the remote peer
function gotIceCandidate(event, peerUuid) {
    if (event.candidate != null) {
        console.log(`Local ICE candidate: \n${event.candidate.candidate}`);

        sendMessageToServer({
            ice: event.candidate,
            uuid: localUuid,
            dest: peerUuid,
        });
    }
}

// Handle incoming remote stream and display it in the UI
function gotRemoteStream(event, peerUuid) {
    console.log(`Got remote stream, peer ${peerUuid}`);
    // Assign stream to a new HTML video element
    const vidElement = document.createElement("video");
    vidElement.setAttribute("autoplay", "");
    vidElement.setAttribute("muted", "");
    vidElement.srcObject = event.streams[0];

    // Create a container for the video and display name
    const vidContainer = document.createElement("div");
    vidContainer.setAttribute("id", "remoteVideo_" + peerUuid);
    vidContainer.setAttribute("class", "videoContainer");
    vidContainer.appendChild(vidElement);
    vidContainer.appendChild(makeLabel(peerConnections[peerUuid].displayName));

    // Add the video container to the "videos" container in the UI
    document.getElementById("videos").appendChild(vidContainer);
}

// Function to check the connection state of a peer and clean up if disconnected
function checkPeerDisconnect(event, peerUuid) {
    const state = peerConnections[peerUuid].pc.iceConnectionState;
    console.log(`connection with peer ${peerUuid} ${state}`);
    if (state === "failed" || state === "closed" || state === "disconnected") {
        // Close the peer connection and remove the video container from the UI
        delete peerConnections[peerUuid];
        document
            .getElementById("videos")
            .removeChild(document.getElementById("remoteVideo_" + peerUuid));
    }
}

// Function to create and return a label element with the provided text
function makeLabel(label) {
    const vidLabel = document.createElement("div");
    vidLabel.appendChild(document.createTextNode(label));
    vidLabel.setAttribute("class", "videoLabel");
    return vidLabel;
}

// Clean up peer connections when the user leaves the page
window.addEventListener("beforeunload", function () {
    for (const peerUuid in peerConnections) {
        peerConnections[peerUuid].pc.close();
    }
    serverConnection.close();
});

// Start the video chat when the page is loaded
window.addEventListener("load", async function () {
    localUuid = generateClientId();
    localDisplayName = prompt("Enter your name", "");

    // Add the local display name to the user interface
    document
        .getElementById("localVideoContainer")
        .appendChild(makeLabel(localDisplayName));

    try {
        localStream = await getUserMediaStream(constraints);

        // Set the local media stream as the source for the local video element
        document.getElementById("localVideo").srcObject = localStream;

        // Set up websocket for signaling and message all existing clients
        serverConnection = new WebSocket("ws://localhost:8080");
        serverConnection.onmessage = handleServerMessage;
        serverConnection.onopen = (event) => {
            // Send a message to the server with the local display name and UUID
            sendMessageToServer({
                displayName: localDisplayName,
                uuid: localUuid,
                dest: "all",
            });
        };
    } catch (error) {
        // Handle getUserMedia permission issues gracefully
        errorHandler("Error accessing media devices: " + error.message);
    }
});
