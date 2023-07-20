// Select the HTML elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');

// Variables for media stream and stream tracks
let localStream;
let videoTrack;

// WebSocket connection and flag to track connection status
let socket;
let isConnected = false;

// Function to start the call
async function startCall() {
  try {
    // Request access to media devices
    localStream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { max: 320 },
            height: { max: 240 },
            frameRate: { max: 30 },
        },
        audio: true,
    });

    // Get the video track from the stream
    videoTrack = localStream.getVideoTracks()[0];

    // Display the local video stream in the video element
    localVideo.srcObject = localStream;

    // Create an instance of RTCPeerConnection
    const peerConnection = new RTCPeerConnection();

    // Add the video track to the peer connection
    peerConnection.addTrack(videoTrack, localStream);

    // Event handler for ICE candidate generation
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // Send the ICE candidate to the other peer
        sendSignalingMessage({
          type: 'candidate',
          candidate: event.candidate,
        });
      }
    };

    // Event handler for track event (remote stream received)
    peerConnection.ontrack = (event) => {
      const remoteStream = event.streams[0];
      // Attach the remote stream to the remote video element
      remoteVideo.srcObject = remoteStream;
    };

    const signalingServerUrl = 'ws://localhost:5000';
    socket = new WebSocket(signalingServerUrl);

    // Event handler for successful WebSocket connection
    socket.onopen = async () => {
      console.log('WebSocket connection established.');
      isConnected = true;

      // Send offer to the signaling server
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      sendSignalingMessage(offer);
    };

    // Event handler for incoming messages from the signaling server
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleSignalingMessage(message);
    };

    // Function to send a signaling message to the server
    function sendSignalingMessage(message) {
      if (isConnected) {
        socket.send(JSON.stringify(message));
      } else {
        console.error('WebSocket connection is not open. Message not sent.');
      }
    }

    // Function to handle incoming signaling messages
    function handleSignalingMessage(message) {
      console.log('message', message)
      switch (message.type) {
        case 'offer':
          handleOffer(message, peerConnection);
          break;
        case 'answer':
          handleAnswer(message, peerConnection);
          break;
        case 'candidate':
          handleCandidate(message, peerConnection);
          break;
        default:
          console.warn('Unknown signaling message type:', message.type);
          break;
      }
    }

    // Function to handle the offer message
    async function handleOffer(offer, peerConnection) {
      // Set the remote description
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Create answer
      const answer = await peerConnection.createAnswer();

      // Set the local description
      await peerConnection.setLocalDescription(answer);

      // Send the answer to the other peer
      sendSignalingMessage(answer);
    }

    // Function to handle the answer message
    async function handleAnswer(answer) {
      // Set the remote description
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    // Function to handle the candidate message
    function handleCandidate(candidate) {
      // Add the ICE candidate to the peer connection
      const iceCandidate = candidate.candidate
      peerConnection.addIceCandidate(iceCandidate)
    }
  } catch (error) {
    console.error('Error accessing media devices:', error);
  }
}

// Function to stop the call
function stopCall() {
  // Stop the video track and remove the stream from the video element
  videoTrack.stop();
  localVideo.srcObject = null;

  // Close the WebSocket connection
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
}

// Add click event listeners to the buttons
startButton.addEventListener('click', startCall);
stopButton.addEventListener('click', stopCall);
