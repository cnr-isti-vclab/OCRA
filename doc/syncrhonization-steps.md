# Synchronization Steps

## Pessimistic approach

Locks applied before start editing. 

Low risk of data loss, Low concurrency, high risk of deadlocks.

### Resource granularity

Resource = asset or annotation.

1. User selects an asset to edit
2. Frontend sends a request to the backend to lock the resource
3. Backend checks if the resource is already locked
4. If not locked, backend locks the resource and sends a response to the frontend
5. Frontend starts editing the resource annotations
6. During editing, the frontend sends heartbeats to the backend to keep the lock alive
7. If the user closes the editor or the connection is lost, or there are no actions for a timeout period, the lock is released
8. When the user clicks save, the frontend sends the annotations to the backend
9. The backend validates the annotations and saves them to the database
10. If the backend detects a conflict, it sends a response to the frontend with the updated annotations
11. The backend sends a response to the frontend with the updated annotations
12. The frontend updates the annotations in the UI
13. Other users are notified of the changes
14. When a user is notified of the changes, it can choose to reload the annotations or to continue working with the current annotations


## Optimistic approach

Locking applied at save time.

### Resource granularity: annotation

1. User selects an asset to edit
2. Frontend loads the asset annotations
3. User edits an annotation (geometry, data or link)
4. User clicks save
5. Frontend sends the annotation to the backend
6. Backend validates the annotation and saves it to the database
7. If the backend detects a conflict, it sends a response to the frontend with the updated annotation
8. If the backend does not detect a conflict, it sends a response to the frontend with the updated annotation
9. In case of conflict the frontend asks the user what to do
10. User chooses to reload the annotations or to continue working with the current annotations
11. If user chooses to reload the annotations, the frontend reloads the annotations from the backend
12. If user chooses to continue working with the current annotations, the frontend discards the changes
