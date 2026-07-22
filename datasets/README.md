# Offline AI Training Datasets

These CSV files are local starter datasets for the rice procurement system.

- `rice_quality_training.csv`: trains damaged/wet bag prediction.
- `queue_training.csv`: documents queue wait-time patterns.
- `vehicle_schedule_training.csv`: trains route priority for vehicle auto-scheduling.
- `weather_risk_training.csv`: documents rainfall protection actions.

The API works offline. As real inspections are saved in the database, the predictor blends live database history with these starter records.
