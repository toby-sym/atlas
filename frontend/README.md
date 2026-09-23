# Atlas spatial workspace

The interface connects to the existing Atlas backend at `http://localhost:8000`.
Set `REACT_APP_API_URL` before starting or building to use a different endpoint.

- The Luminary Dock supports chat, file uploads, browser speech recognition where
  available, and `Ctrl/Cmd K` to focus. Voice recognition uses the browser's speech
  provider; it is not guaranteed to run locally.
- Web research and Memory chips are sent as typed preferences. When enabled,
  Atlas retrieves that context before asking the model; explicit requests still
  work when a chip is off.
- The Overview example is a labeled, simulated workflow. It demonstrates thinking,
  execution, and incremental text with collapsible logs; it does not change files.
- Real chat uses the existing buffered `/chat` endpoint. Live token/tool events,
  GPU/VRAM measurements, memory graphs, and worker telemetry need backend support.
  Unavailable hardware values are displayed as dashes.
- Code offers Copy and a Diff against an empty file. Run shows the bundled example
  output in preview mode; for model responses it prepares a request for Atlas to
  explain execution in your environment. It does not evaluate arbitrary code.
- Session history and the list of newly uploaded files are held in memory. A
  selected text, PDF, or DOCX file is attached to the next request. Uploaded files
  persist in the backend workspace.
- The header reports backend and Ollama model status separately and retries the
  status check every five seconds while the app is open.
- Browser speech recognition may send audio to the speech provider selected by
  the browser; Atlas does not process voice audio on its backend.
- Responsive layouts, keyboard focus styles, and reduced-motion preferences are
  supported. The visual core uses CSS and SVG; no generated image asset is needed.

Run `npm test -- --watchAll=false --runInBand` for interaction tests and
`npm run build` for the production bundle. Jest's import aliases support the
modern Markdown dependency graph under Create React App's older test resolver.

## Create React App tooling

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
