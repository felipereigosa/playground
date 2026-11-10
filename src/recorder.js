import * as index from './index.js'

let recording = false
let actions = []
let playing = false

export function toggleRecording () {
  recording = !recording

  if (recording) {
    actions = []
    console.log('started recording')
  }
  else {
    let startTime = actions[0].time
    for (let action of actions) {
      action.time -= startTime
    }
    console.log('stopped recording')

    fetch('/store-actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(actions)
    })
  }
}

export function log (type, event) {
  if (recording) {
    event.type = type
    event.time = Date.now()
    actions.push(event)
  }
}

function doActions (actions) {
  if (actions.length > 0 && playing) {
    let action = actions.pop()
    setTimeout(() => {
      let controller = scene.getObjectByName(action.hand + '_controller')
      controller.position.copy(action.position)
      controller.rotation.copy(action.rotation)

      if (action.type === 'buttonPressed') {
        index.buttonPressed(action.hand, action.button)
      }
      else if (action.type === 'buttonReleased') {
        index.buttonReleased(action.hand, action.button)
      }

      doActions(actions)
    }, action.time)
  }
  else {
    playing = false
  }
}

export function togglePlayback () {
  if (playing) {
    playing = false
    console.log('stopped playback')
  }
  else {
    playing = true
    fetch('/get-actions')
      .then(response => response.json())
      .then(actions => {
        for (let i = actions.length - 1; i > 0; i--) {
          actions[i].time = actions[i].time - actions[i - 1].time
        }

        actions.reverse()
        doActions(actions)
      })
  }
}

export function isPlaying () {
  return playing
}
