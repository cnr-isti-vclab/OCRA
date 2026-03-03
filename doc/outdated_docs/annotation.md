# Annotations in 3D Models

## Basic Concepts
Two main concepts: Annotations and Georeferences
- Georeferences: 3D points, lines, or areas geometrically defined within the model's space
- Annotations: A set of controlled vocabulary information associated with a set of Georeferences

In practice, an annotation is a semantic description of a set of georeferences on the 3D model.

## Example of 3D Annotations in Practice
Graphic documentation of "Il restauro de La Grande Genesi n.4" . In this Italian documentation of a restoration projects the annotations are Hierarchically structured in the following way:
- Procedimenti Costitutivi ()
    - Tecnica Esecutiva ("segni di spatola", "segni di stecca", "segni di formatura", etc.)
    - Materiali Costitutivi ("paglia", "gesso", "Tavolato ligneo", etc.)
- Stato di Fatto
    - Stato di conservazione
    - Interventi Precedenti
- Progetto di restauro
    - Interventi di restauro
    - Indagini diagnostiche
 
## Annotation Fields
For each annotation created by an user we store the following basic fields:

- Type of annotation, unique for each annotation, chosen from a controlled list or tree (structured semantic thesauri)
- Date
- Author
- Description (short free text entered by the user if desired)
- Notes
- Georeference
- References to other annotations
- Attachments (photos, documents, etc.)


Note on vocabulary:
- The vocabulary is structured in semantic thesauri (tree format) for the 'type of annotation' field
- The vocabulary is managed at the system level by users with project manager privileges
- The vocabulary is associated with


Note on the Orientation of 3d models;
we expect models that are properly oriented with the Y-axis pointing upwards and the Z-axis pointing towards the viewer.