import { validationResult } from 'express-validator';
import prisma from '../helpers/prisma.js'

import jwt from "jsonwebtoken"

import { verifyFirebasePhoneToken } from "../middlewares/firebaseAuth.js"

export async function createClient(req, res) {
    const { name, email, phone, businessId } = req.body

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        // we check if the client already exists in the business
        const client = await prisma.client.findUnique({
            where: { phone },
            include: { businesses: true }
        })

        if(client){
            // if the client exists we check if it is already associated with the business
            if(client.businesses.find(b => b.businessId === businessId)) return res.status(409).json({ msg: "Client already exists", client })
            // if not we create the relation with the business
            const newBusinessClient = await prisma.businessClient.create({
                data: { clientId: client.id, businessId }
            })
            return res.status(201).json({ msg: "Client linked successfully", client: newBusinessClient})
        }
        // if not we create the client and the relation with the business
        const newClient = await prisma.client.create({
            data: { 
                name, 
                email, 
                phone, 
                isConfirmed: true,
            }
        })
        const newBusinessClient = await prisma.businessClient.create({
            data: { clientId: newClient.id, businessId }
        })
        return res.status(201).json({ msg: "Client created successfully", client: newBusinessClient})
        
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Client already exists" })
        }
        return res.status(500).json(error)
    }
}



export async function createClientSelfService(req, res) {
    const { name, email, phone, businessId } = req.body

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        // we check if the client already exists in the business
        const client = await prisma.client.findUnique({
            where: { phone },
            include: { businesses: true }
        })

        if(client){
            // if the client exists we check if it is already associated with the business
            if(client.businesses.find(b => b.businessId === businessId)) return res.status(409).json({ msg: "Client already exists" })
            // if not we create the relation with the business
            const newBusinessClient = await prisma.businessClient.create({
                data: { clientId: client.id, businessId }
            })
            return res.status(201).json({ msg: "Client linked successfully", client: newBusinessClient})
        }

        // if not we create the client and the relation with the business
        const newClient = await prisma.client.create({
            data: {
                name, 
                email, 
                phone, 
                isConfirmed: false,
                firebaseUid: null
            }
        })
        const newBusinessClient = await prisma.businessClient.create({
            data: { clientId: newClient.id, businessId }
        })

        return res.status(201).json({ msg: "Client created, waiting for phone confirmation", client: newBusinessClient})
        
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Client already exists" })
        }
        return res.status(500).json(error)
    }
}

export async function confirmClient(req, res) {
    const { phone, idToken, businessId } = req.body;

    try {
        const client = await prisma.client.findUnique({ where: { phone } });

        if (!client) {
            return res.status(404).json({ msg: "Client not found" });
        }

        const decodedToken = await verifyFirebasePhoneToken(idToken);
        if (decodedToken.phone_number !== phone) {
            return res.status(400).json({ msg: "Phone number does not match verified token" });
        }

        const businessClient = await prisma.businessClient.findUnique({ 
            where: { 
                businessId_clientId: {
                    clientId: client.id,
                    businessId: businessId
                }
            },
            include: {
                client: true
            }
        });

        if (!businessClient) {
            return res.status(404).json({ msg: "Business client relation not found" });
        }

        await prisma.client.update({
            where: { phone },
            data: {
                isConfirmed: true,
                firebaseUid: decodedToken.uid
            }
        });

        const token = jwt.sign({
            "id": businessClient.id,
            "name": client.name,
            "phone": phone,
            "businessId": businessClient.businessId
        }, process.env.SECRET_KEY, {
            expiresIn: "30d"
        });

        const clientData = {
            businessClient: businessClient.id,
            name: businessClient.client.name, 
            businessId: businessClient.businessId
        };

        return res.status(200).json({ msg: "Phone confirmed successfully", token, client: clientData });
    } catch (error) {
        return res.status(400).json({ msg: error.message || "Firebase phone confirmation failed" });
    }
}

export async function loginClient(req, res) {
    const { idToken, businessId } = req.body;

    try {
        if (!idToken) {
            return res.status(400).json({
                msg: "Firebase ID token is required"
            });
        }

        const decodedToken = await verifyFirebasePhoneToken(idToken);

        const phone = decodedToken.phone_number;
        const firebaseUid = decodedToken.uid;

        // Buscar cliente únicamente por teléfono
        const client = await prisma.client.findUnique({
            where: { phone }
        });

        if (!client) {
            return res.status(404).json({
                msg: "Client not found"
            });
        }

        // Si nunca se había vinculado a Firebase, lo vinculamos
        if (!client.firebaseUid) {
            await prisma.client.update({
                where: { id: client.id },
                data: {
                    firebaseUid,
                    isConfirmed: true
                }
            });
        }
        // Si ya estaba vinculado, validamos que sea el mismo UID
        else if (client.firebaseUid !== firebaseUid) {
            return res.status(401).json({
                msg: "Invalid Firebase account"
            });
        }

        const businessClient = await prisma.businessClient.findUnique({
            where: {
                businessId_clientId: {
                    businessId,
                    clientId: client.id
                }
            },
            include: {
                client: {
                    select: {
                        name: true
                    }
                }
            }
        });

        if (!businessClient || businessClient.deletedAt) {
            return res.status(404).json({
                msg: "Client not found for this business"
            });
        }

        const token = jwt.sign(
            {
                id: businessClient.id,
                name: businessClient.client.name,
                businessId: businessClient.businessId
            },
            process.env.SECRET_KEY,
            {
                expiresIn: "30d"
            }
        );

        const clientData = {
            businessClient: businessClient.id,
            name: businessClient.client.name,
            businessId: businessClient.businessId
        };

        return res.status(200).json({
            token,
            client: clientData
        });

    } catch (error) {
        return res.status(401).json({
            msg: error.message || "Firebase authentication failed"
        });
    }
}

export async function getClients(req, res) {
    const { businessId } = req.user
    try {
        const clients = await prisma.businessClient.findMany({
            where: {
                businessId, 
                deletedAt: null
            },
            include: {
                client: true
            },
            orderBy: { createdAt: 'asc' }
        })
        return res.status(200).json({clients})
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Business doesnt exists" })
        }
        return res.status(500).json(error)
    }

}

export async function getClientParams(req, res) {
    const searchParams = req.query

    const page = Number(searchParams.page) || 1
    const limit = Number(searchParams.limit) || 20
    const search = searchParams.search || ""
    const date = searchParams.date || null

    const { businessId } = req.user
    
    const where = {
        businessId,
        deletedAt: null,
        client: {
                OR:[
                {   name: {
                        contains: search,
                        mode: "insensitive"
                    }
                },
                {
                    phone: {
                        contains: search,
                        mode: "insensitive"
                    }
                },
                {
                    email: {
                        contains: search,
                        mode: "insensitive"
                    }
                }
            ]
            }
    }

    try {
        const [clients, total] = await Promise.all([
            prisma.businessClient.findMany({
                where,
                include: {
                    client: true
                },
                orderBy: { createdAt: "asc" },
                skip: (page - 1) * limit,
                take: limit
            }),

            prisma.businessClient.count({ where })
        ])
        const totalPages = Math.ceil(total / limit)
        return res.status(200).json({clients, total, totalPages, currentPage: page})
    } catch (error) {
            return res.status(500).json({
            message: error.message,
            meta: error.meta,
            stack: error.stack
        })
    }
    
}

export async function getClientById(req, res) {
    const { id } = req.query
    try {
        const client = await prisma.businessClient.findUnique({
            where: {
                id, 
                deletedAt: null
            },
            include: {
                client: true,
                notes: true,
                appointments: true
            }
        })
        return res.status(200).json({client})
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Business doesnt exists" })
        }
        return res.status(500).json(error)
    }
}

export async function updateClient(req, res){
    const { id, name, phone, email } = req.body

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    try {
        await prisma.client.update({
            where: {id},
            data: {
                name,
                phone,
                email
            }
        })
        res.status(201).json({ msg: "Client updated successfully" })
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Client doesnt exists" })
        }
        return res.status(500).json(error)
    }
}

export async function deleteClient(req, res) {
    const { id } = req.body
    try {
        const clients = await prisma.businessClient.update({
            where: {
                id,
                deletedAt: null
            },
            data: {
                deletedAt: new Date()
            }
        })
        return res.status(200).json({clients})
    } catch (error) {
        if (error.code === "P2005") {
            return res.status(409).json({ msg: "Client doesnt exists" })
        }
        return res.status(500).json(error)
    }
}