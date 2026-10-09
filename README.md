# Somsed

Reverse Desmos: draw a graph and get an equation.

[Try Somsed](https://somsed.onrender.com)

## Features

- Draw with a mouse, stylus or touchscreen.
- Hold at the end of a stroke to recognise lines, circles, ellipses, rectangles, triangles, polygons and stars.
- Adjust recognised shapes and edit their numerical properties.
- Fit freehand curves using linear, quadratic, cubic, absolute-value and sine models.
- Compare candidate fits or choose a model and refit.
- Edit fitted curve parameters and toggle the original sketch and fitted curve.
- Copy equations as plain text or LaTeX.
- Zoom and pan while keeping drawings aligned with the coordinate grid.

Freehand equations are approximations. Fitting supports both `y = f(x)` and `x = g(y)`; arbitrary loops and curves requiring parametric equations are not currently supported by the freehand fitter.

## Built with

- HTML, CSS and JavaScript
- Canvas and Pointer Events
- FastAPI, NumPy and SciPy
- KaTeX for equation display
- PostHog for usage analytics

The frontend and backend are hosted on Render.

## Run locally

Clone the repository:

```bash
git clone https://github.com/adritanotadorito/somsed.git
cd somsed
```

Start the backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

On Windows, activate the environment with `.venv\Scripts\activate` instead.

In `config.js`, set `BACKEND_URL` to `http://127.0.0.1:8001/fit` for local development.

In a second terminal, from the repository root:

```bash
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000). The backend health check is at [localhost:8001/health](http://localhost:8001/health).

## Configuration

Frontend settings are in `config.js`:

| Setting | Purpose |
| --- | --- |
| `BACKEND_URL` | Backend endpoint, including `/fit` |
| `POSTHOG_KEY` | Public PostHog project key; leave empty to disable analytics |
| `POSTHOG_HOST` | PostHog ingestion host for the project's region |
| `DEV_ANALYTICS` | Whether analytics runs during local development |

The backend reads `ALLOWED_ORIGINS` from the environment. For deployment, set it to the frontend's origin, such as `https://somsed.onrender.com`. Multiple origins can be comma-separated.

Restore the production backend URL before publishing local configuration changes.

## Project structure

| File or directory | Purpose |
| --- | --- |
| `index.html`, `style.css` | Interface and styling |
| `script.js` | Drawing, graph rendering and editing |
| `recognition.js` | Shape recognition |
| `equations.js` | Equation generation and curve helpers |
| `config.js`, `analytics.js` | Configuration and analytics |
| `backend/` | Curve-fitting API |
| `test_*.js`, `backend/test_fitting.py` | Existing tests |
