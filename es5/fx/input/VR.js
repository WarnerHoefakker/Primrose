"use strict";

/* global THREE, Primrose, HMDVRDevice, PositionSensorVRDevice, pliny, Promise */

Primrose.Input.VR = function () {
  pliny.class({
    parent: "Primrose.Input",
    name: "VR",
    description: "| [under construction]"
  });
  function VRInput(name, commands, socket, elem, selectedIndex) {
    if (commands === undefined || commands === null) {
      commands = VRInput.AXES.map(function (a) {
        return {
          name: a,
          axes: [Primrose.Input.VR[a]]
        };
      });
    }

    Primrose.Input.ButtonAndAxis.call(this, name, commands, socket, VRInput.AXES);

    var listeners = {
      vrdeviceconnected: [],
      vrdevicelost: []
    };

    this.addEventListener = function (event, handler, bubbles) {
      if (listeners[event]) {
        listeners[event].push(handler);
      }
      if (event === "vrdeviceconnected") {
        Object.keys(this.displays).forEach(handler);
      }
    };

    this.displays = [];
    this.currentDisplay = null;
    this.currentPose = null;
    this.transforms = null;

    function onConnected(id) {
      for (var i = 0; i < listeners.vrdeviceconnected.length; ++i) {
        listeners.vrdeviceconnected[i](id);
      }
    }

    var onFullScreenChange = function onFullScreenChange() {};

    function enumerateVRDisplays(elem, displays) {
      console.log("Displays found:", displays.length);
      this.displays = displays;
      this.displays.forEach(onConnected);

      if (typeof selectedIndex !== "number" && this.displays.length >= 1) {
        selectedIndex = 0;
      }
      if (typeof selectedIndex === "number") {
        this.connect(selectedIndex);
        return this.currentDisplay;
      }
    }

    function enumerateLegacyVRDevices(elem, devices) {
      console.log("Devices found:", devices.length);
      var displays = {},
          id = null;

      for (var i = 0; i < devices.length; ++i) {
        var device = devices[i];
        id = device.hardwareUnitId;
        if (!displays[id]) {
          displays[id] = {};
        }

        var display = displays[id];
        if (device instanceof HMDVRDevice) {
          display.display = device;
        } else if (devices[i] instanceof PositionSensorVRDevice) {
          display.sensor = device;
        }
      }

      var mockedLegacyDisplays = [];
      for (id in displays) {
        mockedLegacyDisplays.push(new Primrose.Input.VR.LegacyVRDisplay(displays[id]));
      }

      return enumerateVRDisplays.call(this, elem, mockedLegacyDisplays);
    }

    function createCardboardVRDisplay(elem) {
      var mockedCardboardDisplays = [new Primrose.Input.VR.CardboardVRDisplay()];
      return enumerateVRDisplays.call(this, elem, mockedCardboardDisplays);
    }

    this.init = function () {
      var _this = this;

      console.info("Checking for VR Displays...");
      if (navigator.getVRDisplays) {
        console.info("Using WebVR API 1");
        return navigator.getVRDisplays().then(enumerateVRDisplays.bind(this, elem));
      } else if (navigator.getVRDevices) {
        console.info("Using Chromium Experimental WebVR API");
        return navigator.getVRDevices().then(enumerateLegacyVRDevices.bind(this, elem)).catch(console.error.bind(console, "Could not find VR devices"));
      } else {
        return new Promise(function (resolve, reject) {
          var timer = setTimeout(reject, 1000);
          var waitForValidMotion = function waitForValidMotion(evt) {
            if (evt.alpha) {
              clearTimeout(timer);
              timer = null;
              window.removeEventListener("deviceorientation", waitForValidMotion);
              console.info("Using Device Motion API");
              resolve(createCardboardVRDisplay.call(_this, elem));
            }
          };
          console.info("Your browser doesn't have WebVR capability. Check out http://mozvr.com/. We're still going to try for Device Motion API, but there is no way to know ahead of time if your device has a motion sensor.");
          window.addEventListener("deviceorientation", waitForValidMotion, false);
        });
      }
    };
  }

  pliny.value({
    parent: "Primrose.Input.VR",
    name: "isAvailable",
    type: "Boolean",
    description: "Flag indicating the browser supports awesomesauce as well as the WebVR standard in some form."
  });
  VRInput.isAvailable = navigator.getVRDisplays || navigator.getVRDevices || navigator.mozGetVRDevices || isMobile;

  VRInput.AXES = ["headX", "headY", "headZ", "headVX", "headVY", "headVZ", "headAX", "headAY", "headAZ", "headRX", "headRY", "headRZ", "headRW", "headRVX", "headRVY", "headRVZ", "headRAX", "headRAY", "headRAZ"];
  Primrose.Input.ButtonAndAxis.inherit(VRInput);

  VRInput.prototype.update = function (dt) {
    if (this.currentDisplay) {
      var pose = this.currentDisplay.getPose();
      if (pose) {
        this.currentPose = pose;

        if (pose.position) {
          this.headX = pose.position[0];
          this.headY = pose.position[1];
          this.headZ = pose.position[2];
        }
        if (pose.linearVelocity) {
          this.headVX = pose.linearVelocity[0];
          this.headVY = pose.linearVelocity[1];
          this.headVZ = pose.linearVelocity[2];
        }
        if (pose.linearAcceleration) {
          this.headAX = pose.linearAcceleration[0];
          this.headAY = pose.linearAcceleration[1];
          this.headAZ = pose.linearAcceleration[2];
        }

        if (pose.orientation) {
          this.headRX = pose.orientation[0];
          this.headRY = pose.orientation[1];
          this.headRZ = pose.orientation[2];
          this.headRW = pose.orientation[3];
        }
        if (pose.angularVelocity) {
          this.headRVX = pose.angularVelocity[0];
          this.headRVY = pose.angularVelocity[1];
          this.headRVZ = pose.angularVelocity[2];
        }
        if (pose.angularAcceleration) {
          this.headRAX = pose.angularAcceleration[0];
          this.headRAY = pose.angularAcceleration[1];
          this.headRAZ = pose.angularAcceleration[2];
        }
      }
    }
    Primrose.Input.ButtonAndAxis.prototype.update.call(this, dt);
  };

  VRInput.prototype.getQuaternion = function (x, y, z, w, value) {
    value = value || new THREE.Quaternion();
    value.set(this.getValue(x), this.getValue(y), this.getValue(z), this.getValue(w));
    return value;
  };

  function fieldOfViewToProjectionMatrix(fov, zNear, zFar) {
    var upTan = Math.tan(fov.upDegrees * Math.PI / 180.0),
        downTan = Math.tan(fov.downDegrees * Math.PI / 180.0),
        leftTan = Math.tan(fov.leftDegrees * Math.PI / 180.0),
        rightTan = Math.tan(fov.rightDegrees * Math.PI / 180.0),
        xScale = 2.0 / (leftTan + rightTan),
        yScale = 2.0 / (upTan + downTan),
        matrix = new THREE.Matrix4();

    matrix.elements[0] = xScale;
    matrix.elements[1] = 0.0;
    matrix.elements[2] = 0.0;
    matrix.elements[3] = 0.0;
    matrix.elements[4] = 0.0;
    matrix.elements[5] = yScale;
    matrix.elements[6] = 0.0;
    matrix.elements[7] = 0.0;
    matrix.elements[8] = -((leftTan - rightTan) * xScale * 0.5);
    matrix.elements[9] = (upTan - downTan) * yScale * 0.5;
    matrix.elements[10] = -(zNear + zFar) / (zFar - zNear);
    matrix.elements[11] = -1.0;
    matrix.elements[12] = 0.0;
    matrix.elements[13] = 0.0;
    matrix.elements[14] = -(2.0 * zFar * zNear) / (zFar - zNear);
    matrix.elements[15] = 0.0;

    return matrix;
  }

  function makeTransform(s, eye, near, far) {
    var t = eye.offset;
    s.translation = new THREE.Matrix4().makeTranslation(t[0], t[1], t[2]);
    s.projection = fieldOfViewToProjectionMatrix(eye.fieldOfView, near, far);
    s.viewport = {
      left: 0,
      top: 0,
      width: eye.renderWidth,
      height: eye.renderHeight
    };
  }

  VRInput.prototype.resetTransforms = function (near, far) {
    if (this.currentDisplay) {
      this.enabled = true;
      var params = {
        left: this.currentDisplay.getEyeParameters("left"),
        right: this.currentDisplay.getEyeParameters("right")
      };
      var transforms = [{}, {}];
      makeTransform(transforms[0], params.left, near, far);
      makeTransform(transforms[1], params.right, near, far);
      transforms[1].viewport.left = transforms[0].viewport.width;
      this.transforms = transforms;
    }
  };

  VRInput.prototype.connect = function (selectedIndex) {
    this.currentDisplay = this.displays[selectedIndex];
  };

  return VRInput;
}();

pliny.issue({
  parent: "Primrose.Input.VR",
  name: "document VR",
  type: "open",
  description: "Finish writing the documentation for the [Primrose.Input.VR](#Primrose_Input_VR) class in the input/ directory"
});
