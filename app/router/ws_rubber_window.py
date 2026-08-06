import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.domain.internal_gv_factory import create_internal_variant

router = APIRouter()

_executor = ThreadPoolExecutor(max_workers=4)


@router.websocket("/ws/rubber-window")
async def ws_rubber_window(websocket: WebSocket):
    await websocket.accept()

    try:
        data = await websocket.receive_json()
    except WebSocketDisconnect:
        return
    except Exception:
        try:
            await websocket.send_json({"type": "error", "message": "Invalid JSON payload received."})
        except WebSocketDisconnect:
            pass
        return

    cancel_event = threading.Event()
    progress_queue: asyncio.Queue = asyncio.Queue()

    def progress_callback(current_batch: int, total_batches: int):
        if cancel_event.is_set():
            raise RuntimeError("computation cancelled")
        loop = asyncio.get_event_loop()
        loop.call_soon_threadsafe(
            progress_queue.put_nowait,
            {"type": "progress", "current_batch": current_batch, "total_batches": total_batches},
        )

    def _run_computation():
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=data.get("session_id"),
        )
        return gv.rubber_window(
            exon=data["exon"],
            interval=data.get("interval"),
            window_size=data.get("window_size"),
            all_window_size=data.get("all_window_size"),
            models_used=data.get("models_used"),
            batch_size=data.get("batch_size", 50),
            first_search_window_size=data.get("first_search_window_size", 20),
            first_search_step=data.get("first_search_step", 10),
            keep_prop=data.get("keep_prop", 30),
            top_more_relevent=data.get("top_more_relevent", 10),
            search_activator_repressor=data.get("search_activator_repressor", "repressor"),
            progress_callback=progress_callback,
        )

    loop = asyncio.get_event_loop()
    compute_future = loop.run_in_executor(_executor, _run_computation)

    async def send_progress_messages():
        try:
            while True:
                msg = await progress_queue.get()
                await websocket.send_json(msg)
        except WebSocketDisconnect:
            cancel_event.set()
        except Exception:
            cancel_event.set()

    sender_task = asyncio.create_task(send_progress_messages())

    try:
        result = await compute_future
        if not cancel_event.is_set():
            result["analysis"] = [
                [{**segment, "value": float(segment["value"])} for segment in segments]
                for segments in result["analysis"]
            ]
            await websocket.send_json({"type": "complete", "data": result})
    except RuntimeError as e:
        if "cancelled" in str(e).lower() and not cancel_event.is_set():
            cancel_event.set()
        if not cancel_event.is_set():
            await websocket.send_json({"type": "error", "message": str(e)})
    except Exception as e:
        if not cancel_event.is_set():
            try:
                await websocket.send_json({"type": "error", "message": str(e)})
            except WebSocketDisconnect:
                pass
    finally:
        cancel_event.set()
        if not sender_task.done():
            sender_task.cancel()
        try:
            await sender_task
        except (asyncio.CancelledError, Exception):
            pass

        while not progress_queue.empty():
            try:
                progress_queue.get_nowait()
            except asyncio.QueueEmpty:
                break