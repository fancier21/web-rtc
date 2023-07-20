const constraints = {
    video: {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 30 },
    },
    audio: false,
};

let localUuid;
let localDisplayName;
let localStream;
let serverConnection;
const peerConnections = {};

function generateClientId() {
    return Math.random().toString(36).substring(2, 9);
}

function errorHandler(error) {
    console.error(error);
    // Add your error handling logic here (e.g., display an error message on the UI).
}

async function start() {
    localUuid = generateClientId();

    localDisplayName = prompt("Enter your name", "");
    document
        .getElementById("localVideoContainer")
        .appendChild(makeLabel(localDisplayName));

    // Set up local video stream
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        document.getElementById("localVideo").srcObject = localStream;

        // Set up websocket and message all existing clients
        serverConnection = new WebSocket("ws://localhost:8080");
        serverConnection.onmessage = gotMessageFromServer;
        serverConnection.onopen = async (event) => {
            await serverConnection.send(
                JSON.stringify({
                    displayName: localDisplayName,
                    uuid: localUuid,
                    dest: "all",
                })
            );
        };
    } catch (error) {
        // Handle getUserMedia permission issues gracefully
        errorHandler("Error accessing media devices: " + error.message);
    }
}

async function gotMessageFromServer(message) {
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
        setUpPeer(peerUuid, signal.displayName);
        await serverConnection.send(
            JSON.stringify({
                displayName: localDisplayName,
                uuid: localUuid,
                dest: peerUuid,
            })
        );
    } else if (signal.displayName && signal.dest === localUuid) {
        // Initiate call if we are the newcomer peer
        setUpPeer(peerUuid, signal.displayName, true);
    } else if (signal.sdp) {
        try {
            await peerConnections[peerUuid].pc.setRemoteDescription(
                new RTCSessionDescription(signal.sdp)
            );

            // Only create answers in response to offers
            if (signal.sdp.type === "offer") {
                const description = await peerConnections[
                    peerUuid
                ].pc.createAnswer();
                await createdDescription(description, peerUuid);
            }
        } catch (error) {
            errorHandler(error);
        }
    } else if (signal.ice) {
        try {
            await peerConnections[peerUuid].pc.addIceCandidate(
                new RTCIceCandidate(signal.ice)
            );
        } catch (error) {
            errorHandler(error);
        }
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

async function createdDescription(description, peerUuid) {
    console.log(`Created ${description.type} description, peer ${peerUuid}`);
    try {
        await peerConnections[peerUuid].pc.setLocalDescription(description);
        await serverConnection.send(
            JSON.stringify({
                sdp: peerConnections[peerUuid].pc.localDescription,
                uuid: localUuid,
                dest: peerUuid,
            })
        );
    } catch (error) {
        errorHandler(error);
    }
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
    // Assign stream to a new HTML video element
    const vidElement = document.createElement("video");
    vidElement.setAttribute("autoplay", "");
    vidElement.setAttribute("muted", "");
    vidElement.srcObject = event.streams[0];

    const vidContainer = document.createElement("div");
    vidContainer.setAttribute("id", "remoteVideo_" + peerUuid);
    vidContainer.setAttribute("class", "videoContainer");
    vidContainer.appendChild(vidElement);
    vidContainer.appendChild(makeLabel(peerConnections[peerUuid].displayName));

    document.getElementById("videos").appendChild(vidContainer);

    updateLayout();
}

function checkPeerDisconnect(event, peerUuid) {
    const state = peerConnections[peerUuid].pc.iceConnectionState;
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
    // Update CSS grid based on the number of displayed videos
    let rowHeight = "98vh";
    let colWidth = "98vw";

    let numVideos = Object.keys(peerConnections).length + 1; // Add one to include the local video

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
    const vidLabel = document.createElement("div");
    vidLabel.appendChild(document.createTextNode(label));
    vidLabel.setAttribute("class", "videoLabel");
    return vidLabel;
}

// Clean up peer connections when the user leaves the page
window.addEventListener("beforeunload", async function () {
    for (const peerUuid in peerConnections) {
        peerConnections[peerUuid].pc.close();
    }
    serverConnection.close();
});

// const constraints = {
//     video: {
//         width: { ideal: 320 },
//         height: { ideal: 240 },
//         frameRate: { ideal: 30 },
//     },
//     audio: false,
// };

// let localUuid;
// let localDisplayName;
// let localStream;
// let serverConnection;
// const peerConnections = {};

// function generateClientId() {
//     return Math.random().toString(36).substring(2, 9);
// }

// function errorHandler(error) {
//     console.error(error);
//     // Add your error handling logic here (e.g., display an error message on the UI).
// }

// function start() {
//     localUuid = generateClientId();

//     localDisplayName = prompt("Enter your name", "");
//     document
//         .getElementById("localVideoContainer")
//         .appendChild(makeLabel(localDisplayName));

//     // Set up local video stream
//     if (navigator.mediaDevices.getUserMedia) {
//         navigator.mediaDevices
//             .getUserMedia(constraints)
//             .then((stream) => {
//                 localStream = stream;
//                 document.getElementById("localVideo").srcObject = stream;

//                 // Set up websocket and message all existing clients
//                 serverConnection = new WebSocket("ws://localhost:8080");
//                 serverConnection.onmessage = gotMessageFromServer;
//                 serverConnection.onopen = (event) => {
//                     serverConnection.send(
//                         JSON.stringify({
//                             displayName: localDisplayName,
//                             uuid: localUuid,
//                             dest: "all",
//                         })
//                     );
//                 };
//             })
//             .catch((error) => {
//                 // Handle getUserMedia permission issues gracefully
//                 errorHandler("Error accessing media devices: " + error.message);
//             });
//     } else {
//         alert("Your browser does not support getUserMedia API");
//     }
// }

// function gotMessageFromServer(message) {
//     const signal = JSON.parse(message.data);
//     const peerUuid = signal.uuid;

//     // Ignore messages that are not for us or from ourselves
//     if (
//         peerUuid === localUuid ||
//         (signal.dest !== localUuid && signal.dest !== "all")
//     )
//         return;

//     if (signal.displayName && signal.dest === "all") {
//         console.log("1");
//         // Set up peer connection object for a newcomer peer
//         setUpPeer(peerUuid, signal.displayName);
//         serverConnection.send(
//             JSON.stringify({
//                 displayName: localDisplayName,
//                 uuid: localUuid,
//                 dest: peerUuid,
//             })
//         );
//     } else if (signal.displayName && signal.dest === localUuid) {
//         console.log("2");
//         // Initiate call if we are the newcomer peer
//         setUpPeer(peerUuid, signal.displayName, true);
//     } else if (signal.sdp) {
//         console.log("3");
//         peerConnections[peerUuid].pc
//             .setRemoteDescription(new RTCSessionDescription(signal.sdp))
//             .then(function () {
//                 // Only create answers in response to offers
//                 if (signal.sdp.type === "offer") {
//                     peerConnections[peerUuid].pc
//                         .createAnswer()
//                         .then((description) =>
//                             createdDescription(description, peerUuid)
//                         )
//                         .catch(errorHandler);
//                 }
//             })
//             .catch(errorHandler);
//     } else if (signal.ice) {
//         peerConnections[peerUuid].pc
//             .addIceCandidate(new RTCIceCandidate(signal.ice))
//             .catch(errorHandler);
//     }
// }

// function setUpPeer(peerUuid, displayName, initCall = false) {
//     peerConnections[peerUuid] = {
//         displayName: displayName,
//         pc: new RTCPeerConnection(),
//     };
//     peerConnections[peerUuid].pc.onicecandidate = (event) =>
//         gotIceCandidate(event, peerUuid);
//     peerConnections[peerUuid].pc.ontrack = (event) =>
//         gotRemoteStream(event, peerUuid);
//     peerConnections[peerUuid].pc.oniceconnectionstatechange = (event) =>
//         checkPeerDisconnect(event, peerUuid);
//     peerConnections[peerUuid].pc.addStream(localStream);

//     if (initCall) {
//         peerConnections[peerUuid].pc
//             .createOffer()
//             .then((description) => createdDescription(description, peerUuid))
//             .catch(errorHandler);
//     }
// }

// function createdDescription(description, peerUuid) {
//     console.log(`Created ${description.type} description, peer ${peerUuid}`);
//     peerConnections[peerUuid].pc
//         .setLocalDescription(description)
//         .then(() => {
//             serverConnection.send(
//                 JSON.stringify({
//                     sdp: peerConnections[peerUuid].pc.localDescription,
//                     uuid: localUuid,
//                     dest: peerUuid,
//                 })
//             );
//         })
//         .catch(errorHandler);
// }

// function gotIceCandidate(event, peerUuid) {
//     if (event.candidate != null) {
//         console.log(`Local ICE candidate: \n${event.candidate.candidate}`);

//         serverConnection.send(
//             JSON.stringify({
//                 ice: event.candidate,
//                 uuid: localUuid,
//                 dest: peerUuid,
//             })
//         );
//     }
// }

// function gotRemoteStream(event, peerUuid) {
//     console.log(`got remote stream, peer ${peerUuid}`);
//     // Assign stream to a new HTML video element
//     const vidElement = document.createElement("video");
//     vidElement.setAttribute("autoplay", "");
//     vidElement.setAttribute("muted", "");
//     vidElement.srcObject = event.streams[0];

//     const vidContainer = document.createElement("div");
//     vidContainer.setAttribute("id", "remoteVideo_" + peerUuid);
//     vidContainer.setAttribute("class", "videoContainer");
//     vidContainer.appendChild(vidElement);
//     vidContainer.appendChild(makeLabel(peerConnections[peerUuid].displayName));

//     document.getElementById("videos").appendChild(vidContainer);

//     updateLayout();
// }

// function checkPeerDisconnect(event, peerUuid) {
//     const state = peerConnections[peerUuid].pc.iceConnectionState;
//     console.log(`connection with peer ${peerUuid} ${state}`);
//     if (state === "failed" || state === "closed" || state === "disconnected") {
//         delete peerConnections[peerUuid];
//         document
//             .getElementById("videos")
//             .removeChild(document.getElementById("remoteVideo_" + peerUuid));
//         updateLayout();
//     }
// }

// function updateLayout() {
//     // Update CSS grid based on the number of displayed videos
//     let rowHeight = "98vh";
//     let colWidth = "98vw";

//     let numVideos = Object.keys(peerConnections).length + 1; // Add one to include the local video

//     if (numVideos > 1 && numVideos <= 4) {
//         // 2x2 grid
//         rowHeight = "48vh";
//         colWidth = "48vw";
//     } else if (numVideos > 4) {
//         // 3x3 grid
//         rowHeight = "32vh";
//         colWidth = "32vw";
//     }

//     document.documentElement.style.setProperty(`--rowHeight`, rowHeight);
//     document.documentElement.style.setProperty(`--colWidth`, colWidth);
// }

// function makeLabel(label) {
//     const vidLabel = document.createElement("div");
//     vidLabel.appendChild(document.createTextNode(label));
//     vidLabel.setAttribute("class", "videoLabel");
//     return vidLabel;
// }

// // Clean up peer connections when the user leaves the page
// window.addEventListener("beforeunload", function () {
//     for (const peerUuid in peerConnections) {
//         peerConnections[peerUuid].pc.close();
//     }
//     serverConnection.close();
// });
