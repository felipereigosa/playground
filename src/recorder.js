import * as index from './index.js'

let recording = false
let actions = []

export function toggle () {
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

export function playback () {
  if (!recording) {
    fetch('/get-actions')
      .then(response => response.json())
      .then(result => {
        for (let action of result) {
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
          }, action.time)
        }
      })
  }
}
