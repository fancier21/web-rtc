const localVideo = document.getElementById("localVideo");
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');

let localStream;
let videoTrack;

const constraints = {
  audio: false,
  video: true,
};

let isConnected = false;

const signalingServerUrl = 'ws://localhost:5000';
const signalingChannel = new WebSocket(signalingServerUrl);

signalingChannel.addEventListener('open', () => {
  console.log('WebSocket connection established.');
  isConnected = true;

  sendSignalingMessage({ user: 1 });
})

function sendSignalingMessage(message) {
  if (isConnected) {
    signalingChannel.send(JSON.stringify(message));
  } else {
    console.error('WebSocket connection is not open. Message not sent.');
  }
}

async function startCall() {
  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      localStream = stream;
      videoTrack = stream.getVideoTracks()[0];

      stream.onremovetrack = () => {
        console.log("Stream ended");
      };

      localVideo.srcObject = stream;
    })
    .catch((error) => {
      if (error.name === "OverconstrainedError") {
        console.error(
          `The resolution ${constraints.video.width.exact}x${constraints.video.height.exact} px is not supported by your device.`,
        );
      } else if (error.name === "NotAllowedError") {
        console.error(
          "You need to grant this page permission to access your camera and microphone.",
        );
      } else {
        console.error(`getUserMedia error: ${error.name}`, error);
      }
    });

  const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
  const peerConnection = new RTCPeerConnection(configuration);

  signalingChannel.addEventListener('message', async message => {
    const msg = JSON.parse(message.data)
    console.log('message', msg)

    if(msg.answer) {
      const remoteDesc = new RTCSessionDescription(answer.answer)
      await peerConnection.setRemoteDescription(remoteDesc)
    } 

    if (msg.offer) {
      peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      sendSignalingMessage.send({ 'answer': answer });
    }
  })

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendSignalingMessage({ "offer": offer });
}


function stopCall() {
  videoTrack.stop();
  localVideo.srcObject = null;
}

startButton.addEventListener('click', startCall);
stopButton.addEventListener('click', stopCall);
